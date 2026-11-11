import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { EstadoConsulta, TiposEvento, type TipoEvento } from '../domain/enums';
import { ErroNaoEncontrado, ErroValidacao, TransicaoInvalidaError } from '../domain/errors';
import { EstadoFactory } from '../domain/state/EstadoFactory';
import { somarHoras } from '../lib/date';
import { montarPagina, type Pagina, type ParametrosPaginacao } from '../lib/pagination';
import { ConfiguracaoSistema } from '../config/ConfiguracaoSistema';
import { eventBus, type IPublicadorEventos } from '../events/EventBus';
import type { ConsultaEventoDados } from '../events/eventos';

export const consultaInclude = {
  paciente: { include: { utilizador: true } },
  medico: { include: { utilizador: true } },
  especialidade: true,
  avaliacao: true,
} satisfies Prisma.ConsultaInclude;

export type ConsultaComRelacoes = Prisma.ConsultaGetPayload<{ include: typeof consultaInclude }>;

export interface FiltroConsultas {
  pacienteId?: string;
  medicoId?: string;
  especialidadeId?: string;
  estado?: string;
  desde?: Date;
  ate?: Date;
  limite?: number;
}

export interface DadosNovaConsulta {
  pacienteId: string;
  medicoId: string;
  especialidadeId?: string | null;
  inicio: Date;
  fim: Date;
  motivo?: string | null;
  atorId?: string | null;
  atorPerfil?: string | null;
}

/**
 * Servico central de consultas. Implementa IAgendavel (ISP) e usa o padrao
 * State para decidir transicoes. Publica eventos no Event Bus (EDA).
 */
export class ConsultaService {
  constructor(
    private readonly db: PrismaClient = prismaPadrao,
    private readonly bus: IPublicadorEventos = eventBus,
    private readonly config: ConfiguracaoSistema = ConfiguracaoSistema.getInstance(),
  ) {}

  async obterPorId(id: string): Promise<ConsultaComRelacoes> {
    const consulta = await this.db.consulta.findUnique({
      where: { id },
      include: consultaInclude,
    });
    if (!consulta) throw new ErroNaoEncontrado('Consulta nao encontrada.');
    return consulta;
  }

  async obterPorToken(token: string): Promise<ConsultaComRelacoes | null> {
    return this.db.consulta.findUnique({
      where: { confirmacaoToken: token },
      include: consultaInclude,
    });
  }

  async listar(filtros: FiltroConsultas = {}): Promise<ConsultaComRelacoes[]> {
    const where: Prisma.ConsultaWhereInput = {
      ...(filtros.pacienteId ? { pacienteId: filtros.pacienteId } : {}),
      ...(filtros.medicoId ? { medicoId: filtros.medicoId } : {}),
      ...(filtros.especialidadeId ? { especialidadeId: filtros.especialidadeId } : {}),
      ...(filtros.estado ? { estado: filtros.estado } : {}),
      ...(filtros.desde || filtros.ate
        ? {
            inicio: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.ate ? { lte: filtros.ate } : {}),
            },
          }
        : {}),
    };

    return this.db.consulta.findMany({
      where,
      include: consultaInclude,
      orderBy: { inicio: 'desc' },
      take: filtros.limite ?? 200,
    });
  }

  async listarPaginado(
    filtros: FiltroConsultas,
    paginacao: ParametrosPaginacao,
  ): Promise<Pagina<ConsultaComRelacoes>> {
    const where: Prisma.ConsultaWhereInput = {
      ...(filtros.pacienteId ? { pacienteId: filtros.pacienteId } : {}),
      ...(filtros.medicoId ? { medicoId: filtros.medicoId } : {}),
      ...(filtros.especialidadeId ? { especialidadeId: filtros.especialidadeId } : {}),
      ...(filtros.estado ? { estado: filtros.estado } : {}),
      ...(filtros.desde || filtros.ate
        ? {
            inicio: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.ate ? { lte: filtros.ate } : {}),
            },
          }
        : {}),
    };

    const total = await this.db.consulta.count({ where });
    const totalPaginas = Math.max(1, Math.ceil(total / paginacao.porPagina));
    const pagina = Math.min(paginacao.pagina, totalPaginas);
    const itens = await this.db.consulta.findMany({
      where,
      include: consultaInclude,
      orderBy: { inicio: 'desc' },
      skip: (pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
    });

    return montarPagina(itens, total, pagina, paginacao.porPagina);
  }

  async criar(dados: DadosNovaConsulta): Promise<ConsultaComRelacoes> {
    const horasExpiracao = this.config.obterNumero('expiracao_confirmacao_horas');
    const consulta = await this.db.consulta.create({
      data: {
        pacienteId: dados.pacienteId,
        medicoId: dados.medicoId,
        especialidadeId: dados.especialidadeId ?? null,
        inicio: dados.inicio,
        fim: dados.fim,
        motivo: dados.motivo ?? null,
        estado: EstadoConsulta.PENDENTE,
        confirmacaoToken: randomUUID(),
        expiraConfirmacaoEm: somarHoras(new Date(), horasExpiracao),
      },
      include: consultaInclude,
    });

    await this.publicar(consulta, TiposEvento.CONSULTA_CRIADA, {
      atorId: dados.atorId ?? null,
      atorPerfil: dados.atorPerfil ?? null,
    });

    return consulta;
  }

  async confirmar(
    consultaId: string,
    atorId?: string | null,
    atorPerfil?: string | null,
  ): Promise<ConsultaComRelacoes> {
    const consulta = await this.obterPorId(consultaId);
    const resultado = EstadoFactory.criar(consulta.estado).confirmar(this.dadosEstado(consulta));
    if (!resultado.permitido) throw new TransicaoInvalidaError(resultado.motivo ?? 'Confirmacao invalida.');

    const atualizada = await this.db.consulta.update({
      where: { id: consultaId },
      data: { estado: resultado.novoEstado, confirmacaoToken: null, expiraConfirmacaoEm: null },
      include: consultaInclude,
    });

    await this.publicar(atualizada, TiposEvento.CONSULTA_CONFIRMADA, {
      atorId: atorId ?? null,
      atorPerfil: atorPerfil ?? null,
    });
    return atualizada;
  }

  async cancelar(
    consultaId: string,
    atorId: string | null,
    motivo: string,
    atorPerfil?: string | null,
  ): Promise<ConsultaComRelacoes> {
    if (!motivo || motivo.trim().length < 3) {
      throw new ErroValidacao('Indique o motivo do cancelamento.', {
        motivo: 'O motivo e obrigatorio (minimo 3 caracteres).',
      });
    }

    const consulta = await this.obterPorId(consultaId);
    const resultado = EstadoFactory.criar(consulta.estado).cancelar(this.dadosEstado(consulta));
    if (!resultado.permitido) throw new TransicaoInvalidaError(resultado.motivo ?? 'Cancelamento invalido.');

    const atualizada = await this.db.consulta.update({
      where: { id: consultaId },
      data: {
        estado: EstadoConsulta.CANCELADA,
        motivoCancelamento: motivo.trim(),
        canceladaPor: atorId ?? 'SISTEMA',
        cancelamentoTardio: resultado.cancelamentoTardio ?? false,
        confirmacaoToken: null,
        expiraConfirmacaoEm: null,
      },
      include: consultaInclude,
    });

    await this.publicar(atualizada, TiposEvento.CONSULTA_CANCELADA, {
      atorId: atorId ?? null,
      atorPerfil: atorPerfil ?? null,
      cancelamentoTardio: resultado.cancelamentoTardio ?? false,
    });

    return atualizada;
  }

  async reagendar(
    consultaId: string,
    novoInicio: Date,
    novoFim: Date,
    atorId: string | null,
    atorPerfil?: string | null,
  ): Promise<ConsultaComRelacoes> {
    const consulta = await this.obterPorId(consultaId);
    const resultado = EstadoFactory.criar(consulta.estado).reagendar(this.dadosEstado(consulta));
    if (!resultado.permitido) throw new TransicaoInvalidaError(resultado.motivo ?? 'Reagendamento invalido.');

    if (novoInicio.getTime() <= Date.now()) {
      throw new ErroValidacao('O novo horario tem de ser no futuro.');
    }

    const continuaPendente = consulta.estado === EstadoConsulta.PENDENTE;

    const atualizada = await this.db.consulta.update({
      where: { id: consultaId },
      data: {
        inicio: novoInicio,
        fim: novoFim,
        ...(continuaPendente
          ? {
              confirmacaoToken: randomUUID(),
              expiraConfirmacaoEm: somarHoras(
                new Date(),
                this.config.obterNumero('expiracao_confirmacao_horas'),
              ),
            }
          : {}),
      },
      include: consultaInclude,
    });

    await this.publicar(atualizada, TiposEvento.CONSULTA_REAGENDADA, {
      atorId: atorId ?? null,
      atorPerfil: atorPerfil ?? null,
    });
    return atualizada;
  }

  async realizar(
    consultaId: string,
    atorId?: string | null,
    atorPerfil?: string | null,
  ): Promise<ConsultaComRelacoes> {
    const consulta = await this.obterPorId(consultaId);
    const resultado = EstadoFactory.criar(consulta.estado).realizar(this.dadosEstado(consulta));
    if (!resultado.permitido) throw new TransicaoInvalidaError(resultado.motivo ?? 'Operacao invalida.');

    const atualizada = await this.db.consulta.update({
      where: { id: consultaId },
      data: { estado: EstadoConsulta.REALIZADA },
      include: consultaInclude,
    });

    await this.publicar(atualizada, TiposEvento.CONSULTA_REALIZADA, {
      atorId: atorId ?? null,
      atorPerfil: atorPerfil ?? null,
    });
    return atualizada;
  }

  /**
   * RN-07: consultas pendentes cujo prazo de 2 horas expirou sao canceladas
   * automaticamente e a vaga fica livre. Chamado periodicamente pelo scheduler.
   */
  async expirarPendentes(agora = new Date()): Promise<number> {
    const expiradas = await this.db.consulta.findMany({
      where: {
        estado: EstadoConsulta.PENDENTE,
        expiraConfirmacaoEm: { lt: agora },
      },
      include: consultaInclude,
    });

    for (const consulta of expiradas) {
      const atualizada = await this.db.consulta.update({
        where: { id: consulta.id },
        data: {
          estado: EstadoConsulta.CANCELADA,
          motivoCancelamento: 'Confirmação expirada automaticamente.',
          canceladaPor: 'SISTEMA',
          confirmacaoToken: null,
          expiraConfirmacaoEm: null,
        },
        include: consultaInclude,
      });
      await this.publicar(atualizada, TiposEvento.CONSULTA_CANCELADA, {
        atorId: null,
        atorPerfil: 'SISTEMA',
      });
    }

    return expiradas.length;
  }

  async publicar(
    consulta: ConsultaComRelacoes,
    tipo: TipoEvento,
    extra: Partial<ConsultaEventoDados> = {},
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.bus.publicar({
      tipo,
      ocorridoEm: new Date(),
      consulta: this.mapearEvento(consulta, extra),
      meta,
    });
  }

  mapearEvento(
    consulta: ConsultaComRelacoes,
    extra: Partial<ConsultaEventoDados> = {},
  ): ConsultaEventoDados {
    return {
      consultaId: consulta.id,
      pacienteId: consulta.pacienteId,
      pacienteNome: consulta.paciente.utilizador.nome,
      pacienteEmail: consulta.paciente.utilizador.email,
      pacienteTelefone: consulta.paciente.utilizador.telefone ?? consulta.paciente.telefone,
      preferenciaPaciente: consulta.paciente.utilizador.preferenciaNotificacao,
      medicoId: consulta.medicoId,
      medicoNome: consulta.medico.utilizador.nome,
      medicoEmail: consulta.medico.utilizador.email,
      medicoTelefone: consulta.medico.telefone,
      especialidade: consulta.especialidade?.nome ?? null,
      inicio: consulta.inicio,
      fim: consulta.fim,
      estado: consulta.estado as EstadoConsulta,
      motivo: consulta.motivo,
      motivoCancelamento: consulta.motivoCancelamento,
      confirmacaoToken: consulta.confirmacaoToken,
      expiraConfirmacaoEm: consulta.expiraConfirmacaoEm,
      ...extra,
    };
  }

  private dadosEstado(consulta: ConsultaComRelacoes) {
    return {
      id: consulta.id,
      inicio: consulta.inicio,
      criadaEm: consulta.criadoEm,
      expiraConfirmacaoEm: consulta.expiraConfirmacaoEm,
      agora: new Date(),
    };
  }
}
