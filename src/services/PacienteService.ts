import { Prisma, type PrismaClient } from '@prisma/client';
import { montarPagina, type Pagina, type ParametrosPaginacao } from '../lib/pagination';
import { prisma as prismaPadrao } from '../lib/prisma';
import { ErroNaoEncontrado } from '../domain/errors';

export const pacienteInclude = { utilizador: true } satisfies Prisma.PacienteInclude;
export type PacienteComRelacoes = Prisma.PacienteGetPayload<{ include: typeof pacienteInclude }>;

/** Servico de gestao de pacientes (RF-09). */
export class PacienteService {
  constructor(private readonly db: PrismaClient = prismaPadrao) {}

  async obterPorId(id: string): Promise<PacienteComRelacoes> {
    const paciente = await this.db.paciente.findUnique({ where: { id }, include: pacienteInclude });
    if (!paciente) throw new ErroNaoEncontrado('Paciente nao encontrado.');
    return paciente;
  }

  async obterPorUtilizadorId(utilizadorId: string): Promise<PacienteComRelacoes> {
    const paciente = await this.db.paciente.findUnique({
      where: { utilizadorId },
      include: pacienteInclude,
    });
    if (!paciente) throw new ErroNaoEncontrado('Perfil de paciente nao encontrado.');
    return paciente;
  }

  async listar(busca?: string): Promise<PacienteComRelacoes[]> {
    const termo = busca?.trim();
    return this.db.paciente.findMany({
      where: termo
        ? {
            OR: [
              { utilizador: { nome: { contains: termo } } },
              { utilizador: { email: { contains: termo } } },
              { telefone: { contains: termo } },
            ],
          }
        : {},
      include: pacienteInclude,
      orderBy: { utilizador: { nome: 'asc' } },
      take: 200,
    });
  }

  async listarPaginado(
    busca: string | undefined,
    paginacao: ParametrosPaginacao,
  ): Promise<Pagina<PacienteComRelacoes>> {
    const termo = busca?.trim();
    const where = termo
      ? {
          OR: [
            { utilizador: { nome: { contains: termo } } },
            { utilizador: { email: { contains: termo } } },
            { telefone: { contains: termo } },
          ],
        }
      : {};

    const total = await this.db.paciente.count({ where });
    const totalPaginas = Math.max(1, Math.ceil(total / paginacao.porPagina));
    const pagina = Math.min(paginacao.pagina, totalPaginas);
    const itens = await this.db.paciente.findMany({
      where,
      include: pacienteInclude,
      orderBy: { utilizador: { nome: 'asc' } },
      skip: (pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
    });

    return montarPagina(itens, total, pagina, paginacao.porPagina);
  }

  async atualizar(
    pacienteId: string,
    dados: {
      nome?: string;
      telefone?: string;
      endereco?: string;
      dataNascimento?: Date | string;
      preferenciaNotificacao?: string;
    },
  ): Promise<PacienteComRelacoes> {
    const paciente = await this.obterPorId(pacienteId);
    await this.db.$transaction(async (tx) => {
      await tx.paciente.update({
        where: { id: pacienteId },
        data: {
          ...(dados.telefone ? { telefone: dados.telefone } : {}),
          ...(dados.endereco ? { endereco: dados.endereco } : {}),
          ...(dados.dataNascimento
            ? { dataNascimento: new Date(dados.dataNascimento) }
            : {}),
        },
      });
      await tx.utilizador.update({
        where: { id: paciente.utilizadorId },
        data: {
          ...(dados.nome ? { nome: dados.nome.trim() } : {}),
          ...(dados.telefone ? { telefone: dados.telefone } : {}),
          ...(dados.preferenciaNotificacao
            ? { preferenciaNotificacao: dados.preferenciaNotificacao }
            : {}),
        },
      });
    });
    return this.obterPorId(pacienteId);
  }

  async estatisticas(pacienteId: string) {
    const [total, realizadas, canceladas, tardias, proximas] = await Promise.all([
      this.db.consulta.count({ where: { pacienteId } }),
      this.db.consulta.count({ where: { pacienteId, estado: 'REALIZADA' } }),
      this.db.consulta.count({ where: { pacienteId, estado: 'CANCELADA' } }),
      this.db.consulta.count({ where: { pacienteId, cancelamentoTardio: true } }),
      this.db.consulta.count({
        where: {
          pacienteId,
          estado: { in: ['PENDENTE', 'CONFIRMADA'] },
          inicio: { gte: new Date() },
        },
      }),
    ]);
    return { total, realizadas, canceladas, tardias, proximas };
  }
}
