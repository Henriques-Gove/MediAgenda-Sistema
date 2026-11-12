import type { PrismaClient } from '@prisma/client';
import { montarPagina, type Pagina, type ParametrosPaginacao } from '../lib/pagination';
import { prisma as prismaPadrao } from '../lib/prisma';

export interface RegistoAuditoria {
  utilizadorId?: string | null;
  acao: string;
  entidade?: string | null;
  entidadeId?: string | null;
  detalhes?: string | null;
  ip?: string | null;
}

/** Servico responsavel por cumprir a RNF-04 (logs de auditoria). */
export class AuditoriaService {
  constructor(private readonly db: PrismaClient = prismaPadrao) {}

  async registar(dados: RegistoAuditoria): Promise<void> {
    await this.db.auditoria.create({
      data: {
        utilizadorId: dados.utilizadorId ?? null,
        acao: dados.acao,
        entidade: dados.entidade ?? null,
        entidadeId: dados.entidadeId ?? null,
        detalhes: dados.detalhes ?? null,
        ip: dados.ip ?? null,
      },
    });
  }

  async listar(filtros: { acao?: string; desde?: Date; utilizadorId?: string } = {}) {
    return this.db.auditoria.findMany({
      where: {
        ...(filtros.acao ? { acao: { contains: filtros.acao, mode: 'insensitive' as const } } : {}),
        ...(filtros.desde ? { criadoEm: { gte: filtros.desde } } : {}),
        ...(filtros.utilizadorId ? { utilizadorId: filtros.utilizadorId } : {}),
      },
      include: { utilizador: { select: { nome: true, perfil: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 300,
    });
  }

  async listarPaginado(
    filtros: { acao?: string; desde?: Date; utilizadorId?: string },
    paginacao: ParametrosPaginacao,
  ): Promise<Pagina<Awaited<ReturnType<AuditoriaService['listar']>>[number]>> {
    const where = {
      ...(filtros.acao ? { acao: { contains: filtros.acao, mode: 'insensitive' as const } } : {}),
      ...(filtros.desde ? { criadoEm: { gte: filtros.desde } } : {}),
      ...(filtros.utilizadorId ? { utilizadorId: filtros.utilizadorId } : {}),
    };

    const total = await this.db.auditoria.count({ where });
    const totalPaginas = Math.max(1, Math.ceil(total / paginacao.porPagina));
    const pagina = Math.min(paginacao.pagina, totalPaginas);
    const itens = await this.db.auditoria.findMany({
      where,
      include: { utilizador: { select: { nome: true, perfil: true } } },
      orderBy: { criadoEm: 'desc' },
      skip: (pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
    });

    return montarPagina(itens, total, pagina, paginacao.porPagina);
  }
}
