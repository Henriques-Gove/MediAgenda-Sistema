import type { PrismaClient } from '@prisma/client';
import { montarPagina, type Pagina, type ParametrosPaginacao } from '../lib/pagination';
import { prisma as prismaPadrao } from '../lib/prisma';
import { TiposEvento } from '../domain/enums';
import { ErroValidacao } from '../domain/errors';
import { EstadoFactory } from '../domain/state/EstadoFactory';
import { eventBus, type IPublicadorEventos } from '../events/EventBus';
import type { ConsultaService } from './ConsultaService';

/** Avaliacao de consultas realizadas (RF-12). */
export class AvaliacaoService {
  constructor(
    private readonly db: PrismaClient = prismaPadrao,
    private readonly consultas: ConsultaService,
    private readonly bus: IPublicadorEventos = eventBus,
  ) {}

  async avaliar(
    consultaId: string,
    pacienteId: string,
    estrelas: number,
    comentario?: string | null,
  ) {
    if (!Number.isInteger(estrelas) || estrelas < 1 || estrelas > 5) {
      throw new ErroValidacao('A avaliacao deve ser entre 1 e 5 estrelas.');
    }

    const consulta = await this.consultas.obterPorId(consultaId);
    if (consulta.pacienteId !== pacienteId) {
      throw new ErroValidacao('So pode avaliar as suas proprias consultas.');
    }

    const estado = EstadoFactory.criar(consulta.estado);
    if (!estado.permiteAvaliacao) {
      throw new ErroValidacao('So e possivel avaliar consultas realizadas.');
    }
    if (consulta.avaliacao) {
      throw new ErroValidacao('Esta consulta ja foi avaliada.');
    }

    const avaliacao = await this.db.avaliacao.create({
      data: {
        consultaId,
        pacienteId,
        medicoId: consulta.medicoId,
        estrelas,
        comentario: comentario?.trim() || null,
      },
    });

    await this.bus.publicar({
      tipo: TiposEvento.CONSULTA_AVALIADA,
      ocorridoEm: new Date(),
      consulta: this.consultas.mapearEvento(consulta, {
        atorId: pacienteId,
        atorPerfil: 'PACIENTE',
      }),
      meta: { estrelas, comentario: avaliacao.comentario },
    });

    return avaliacao;
  }

  async listarPorMedico(medicoId: string, limite = 50) {
    return this.db.avaliacao.findMany({
      where: { medicoId },
      include: { paciente: { include: { utilizador: true } } },
      orderBy: { criadoEm: 'desc' },
      take: limite,
    });
  }

  async listarRecentes(limite = 20) {
    return this.db.avaliacao.findMany({
      include: {
        paciente: { include: { utilizador: true } },
        medico: { include: { utilizador: true } },
      },
      orderBy: { criadoEm: 'desc' },
      take: limite,
    });
  }

  async listarRecentesPaginado(
    paginacao: ParametrosPaginacao,
  ): Promise<Pagina<Awaited<ReturnType<AvaliacaoService['listarRecentes']>>[number]>> {
    const total = await this.db.avaliacao.count();
    const totalPaginas = Math.max(1, Math.ceil(total / paginacao.porPagina));
    const pagina = Math.min(paginacao.pagina, totalPaginas);
    const itens = await this.db.avaliacao.findMany({
      include: {
        paciente: { include: { utilizador: true } },
        medico: { include: { utilizador: true } },
      },
      orderBy: { criadoEm: 'desc' },
      skip: (pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
    });

    return montarPagina(itens, total, pagina, paginacao.porPagina);
  }

  async media(medicoId: string): Promise<{ media: number | null; total: number }> {
    const resultado = await this.db.avaliacao.aggregate({
      where: { medicoId },
      _avg: { estrelas: true },
      _count: { _all: true },
    });
    return { media: resultado._avg.estrelas ?? null, total: resultado._count._all };
  }
}
