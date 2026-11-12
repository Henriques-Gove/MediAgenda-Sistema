import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { ErroNaoEncontrado, ErroValidacao } from '../domain/errors';
import { TiposEvento } from '../domain/enums';
import { eventBus, type IPublicadorEventos } from '../events/EventBus';
import type { ConsultaService } from './ConsultaService';

export const medicoInclude = {
  utilizador: true,
  especialidades: { include: { especialidade: true } },
  disponibilidades: { orderBy: { diaSemana: 'asc' } },
  bloqueios: { orderBy: { inicio: 'asc' } },
} satisfies Prisma.MedicoInclude;

export type MedicoComRelacoes = Prisma.MedicoGetPayload<{ include: typeof medicoInclude }>;

export interface MedicoComAvaliacao extends MedicoComRelacoes {
  avaliacaoMedia: number | null;
  totalAvaliacoes: number;
}

export interface FiltroMedicos {
  busca?: string;
  especialidadeId?: string;
  localizacao?: string;
  avaliacaoMinima?: number;
}

export interface DadosAtualizacaoMedico {
  numeroRegisto?: string;
  telefone?: string;
  localizacao?: string;
  bio?: string | null;
  duracaoConsultaMinutos?: number;
  maxConsultasDia?: number;
  especialidadeIds?: string[];
}

/** Servico de gestao de medicos (RF-08, RF-10, RF-14). */
export class MedicoService {
  constructor(
    private readonly db: PrismaClient = prismaPadrao,
    private readonly consultas: ConsultaService,
    private readonly bus: IPublicadorEventos = eventBus,
  ) {}

  async listar(filtros: FiltroMedicos = {}): Promise<MedicoComAvaliacao[]> {
    const busca = filtros.busca?.trim();
    const where: Prisma.MedicoWhereInput = {
      ativo: true,
      ...(filtros.localizacao
        ? { localizacao: { contains: filtros.localizacao.trim(), mode: 'insensitive' as const } }
        : {}),
      ...(busca
        ? {
            OR: [
              { utilizador: { nome: { contains: busca, mode: 'insensitive' as const } } },
              { localizacao: { contains: busca, mode: 'insensitive' as const } },
              { especialidades: { some: { especialidade: { nome: { contains: busca, mode: 'insensitive' as const } } } } },
            ],
          }
        : {}),
      ...(filtros.especialidadeId
        ? { especialidades: { some: { especialidadeId: filtros.especialidadeId } } }
        : {}),
    };

    const medicos = await this.db.medico.findMany({
      where,
      include: medicoInclude,
      orderBy: { utilizador: { nome: 'asc' } },
    });

    const avaliacoes = await this.db.avaliacao.groupBy({
      by: ['medicoId'],
      _avg: { estrelas: true },
      _count: { _all: true },
    });
    const mapa = new Map(
      avaliacoes.map((a) => [
        a.medicoId,
        { media: a._avg.estrelas ?? null, total: a._count._all },
      ]),
    );

    const resultado: MedicoComAvaliacao[] = medicos.map((medico) => {
      const avaliacao = mapa.get(medico.id);
      return {
        ...medico,
        avaliacaoMedia: avaliacao?.media ?? null,
        totalAvaliacoes: avaliacao?.total ?? 0,
      };
    });

    if (filtros.avaliacaoMinima && filtros.avaliacaoMinima > 0) {
      return resultado.filter(
        (medico) => (medico.avaliacaoMedia ?? 0) >= filtros.avaliacaoMinima!,
      );
    }

    return resultado;
  }

  async listarTodos(): Promise<MedicoComRelacoes[]> {
    return this.db.medico.findMany({
      include: medicoInclude,
      orderBy: { utilizador: { nome: 'asc' } },
    });
  }

  async obterPorId(id: string): Promise<MedicoComRelacoes> {
    const medico = await this.db.medico.findUnique({ where: { id }, include: medicoInclude });
    if (!medico) throw new ErroNaoEncontrado('Medico nao encontrado.');
    return medico;
  }

  async obterPorUtilizadorId(utilizadorId: string): Promise<MedicoComRelacoes> {
    const medico = await this.db.medico.findUnique({
      where: { utilizadorId },
      include: medicoInclude,
    });
    if (!medico) throw new ErroNaoEncontrado('Perfil de medico nao encontrado.');
    return medico;
  }

  async atualizar(medicoId: string, dados: DadosAtualizacaoMedico): Promise<MedicoComRelacoes> {
    if (
      dados.duracaoConsultaMinutos !== undefined &&
      (dados.duracaoConsultaMinutos < 60 || dados.duracaoConsultaMinutos > 120)
    ) {
      throw new ErroValidacao('A duração da consulta deve estar entre 60 e 120 minutos.');
    }
    if (dados.maxConsultasDia !== undefined && dados.maxConsultasDia < 1) {
      throw new ErroValidacao('O limite diario deve ser pelo menos 1.');
    }

    await this.db.$transaction(async (tx) => {
      await tx.medico.update({
        where: { id: medicoId },
        data: {
          ...(dados.numeroRegisto ? { numeroRegisto: dados.numeroRegisto } : {}),
          ...(dados.telefone ? { telefone: dados.telefone } : {}),
          ...(dados.localizacao ? { localizacao: dados.localizacao } : {}),
          ...(dados.bio !== undefined ? { bio: dados.bio } : {}),
          ...(dados.duracaoConsultaMinutos !== undefined
            ? { duracaoConsultaMinutos: dados.duracaoConsultaMinutos }
            : {}),
          ...(dados.maxConsultasDia !== undefined
            ? { maxConsultasDia: dados.maxConsultasDia }
            : {}),
        },
      });

      if (dados.especialidadeIds) {
        await tx.medicoEspecialidade.deleteMany({ where: { medicoId } });
        await tx.medicoEspecialidade.createMany({
          data: dados.especialidadeIds.map((especialidadeId) => ({
            medicoId,
            especialidadeId,
          })),
        });
      }
    });

    return this.obterPorId(medicoId);
  }

  /**
   * RN-08: ao desactivar um medico, todas as consultas futuras sao canceladas
   * e os pacientes sao notificados (o evento ConsultaCancelada trata disso).
   */
  async desativar(medicoId: string, atorId: string | null): Promise<number> {
    const medico = await this.obterPorId(medicoId);
    const futuras = await this.consultas.listar({
      medicoId,
      desde: new Date(),
      limite: 500,
    });
    const activas = futuras.filter(
      (consulta) => consulta.estado === 'PENDENTE' || consulta.estado === 'CONFIRMADA',
    );

    for (const consulta of activas) {
      await this.consultas.cancelar(
        consulta.id,
        atorId,
        'Médico desativado pela administração.',
        'ADMINISTRADOR',
      );
    }

    await this.db.medico.update({ where: { id: medicoId }, data: { ativo: false } });
    await this.db.utilizador.update({
      where: { id: medico.utilizadorId },
      data: { ativo: false },
    });

    await this.bus.publicar({
      tipo: TiposEvento.MEDICO_DESATIVADO,
      ocorridoEm: new Date(),
      medicoId,
      meta: { medico: medico.utilizador.nome, consultasCanceladas: activas.length, atorId },
    });

    return activas.length;
  }

  async reativar(medicoId: string): Promise<void> {
    const medico = await this.obterPorId(medicoId);
    await this.db.medico.update({ where: { id: medicoId }, data: { ativo: true } });
    await this.db.utilizador.update({
      where: { id: medico.utilizadorId },
      data: { ativo: true },
    });
  }

  async avaliacaoMedia(medicoId: string): Promise<{ media: number | null; total: number }> {
    const resultado = await this.db.avaliacao.aggregate({
      where: { medicoId },
      _avg: { estrelas: true },
      _count: { _all: true },
    });
    return { media: resultado._avg.estrelas ?? null, total: resultado._count._all };
  }
}
