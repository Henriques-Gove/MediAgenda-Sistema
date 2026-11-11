import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { ErroNaoEncontrado, ErroValidacao } from '../domain/errors';

export const especialidadeInclude = {
  _count: { select: { medicos: true, consultas: true } },
} satisfies Prisma.EspecialidadeInclude;

export type EspecialidadeComContagem = Prisma.EspecialidadeGetPayload<{
  include: typeof especialidadeInclude;
}>;

/** Gestao de especialidades (RF-11). */
export class EspecialidadeService {
  constructor(private readonly db: PrismaClient = prismaPadrao) {}

  async listar(incluirInactivas = false): Promise<EspecialidadeComContagem[]> {
    return this.db.especialidade.findMany({
      where: incluirInactivas ? {} : { ativa: true },
      include: especialidadeInclude,
      orderBy: { nome: 'asc' },
    });
  }

  async obterPorId(id: string): Promise<EspecialidadeComContagem> {
    const especialidade = await this.db.especialidade.findUnique({
      where: { id },
      include: especialidadeInclude,
    });
    if (!especialidade) throw new ErroNaoEncontrado('Especialidade nao encontrada.');
    return especialidade;
  }

  async criar(dados: {
    nome: string;
    descricao?: string | null;
    duracaoPadraoMinutos?: number;
  }): Promise<EspecialidadeComContagem> {
    const nome = dados.nome?.trim();
    if (!nome) throw new ErroValidacao('Indique o nome da especialidade.');

    const existente = await this.db.especialidade.findUnique({ where: { nome } });
    if (existente) throw new ErroValidacao('Ja existe uma especialidade com este nome.');

    return this.db.especialidade.create({
      data: {
        nome,
        descricao: dados.descricao ?? null,
        duracaoPadraoMinutos: this.validarDuracao(dados.duracaoPadraoMinutos),
      },
      include: especialidadeInclude,
    });
  }

  async atualizar(
    id: string,
    dados: { nome?: string; descricao?: string | null; duracaoPadraoMinutos?: number; ativa?: boolean },
  ): Promise<EspecialidadeComContagem> {
    await this.obterPorId(id);
    if (dados.nome) {
      const existente = await this.db.especialidade.findFirst({
        where: { nome: dados.nome.trim(), id: { not: id } },
      });
      if (existente) throw new ErroValidacao('Ja existe uma especialidade com este nome.');
    }

    return this.db.especialidade.update({
      where: { id },
      data: {
        ...(dados.nome ? { nome: dados.nome.trim() } : {}),
        ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
        ...(dados.duracaoPadraoMinutos !== undefined
          ? { duracaoPadraoMinutos: this.validarDuracao(dados.duracaoPadraoMinutos) }
          : {}),
        ...(dados.ativa !== undefined ? { ativa: dados.ativa } : {}),
      },
      include: especialidadeInclude,
    });
  }

  async desativar(id: string): Promise<void> {
    await this.obterPorId(id);
    await this.db.especialidade.update({ where: { id }, data: { ativa: false } });
  }

  private validarDuracao(minutos?: number): number {
    if (minutos === undefined) return 60;
    if (minutos < 60 || minutos > 120) {
      throw new ErroValidacao('A duração deve estar entre 60 e 120 minutos.');
    }
    return minutos;
  }
}
