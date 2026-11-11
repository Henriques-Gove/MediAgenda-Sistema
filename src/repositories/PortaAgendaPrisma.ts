import type { PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { EstadoConsulta } from '../domain/enums';
import type { PortaAgenda } from '../domain/chain/PedidoMarcacao';
import { fimDoDia, inicioDoDia } from '../lib/date';

/** Implementacao Prisma da porta usada pela cadeia de validacao. */
export class PortaAgendaPrisma implements PortaAgenda {
  constructor(private readonly db: PrismaClient = prismaPadrao) {}

  async existeConflito(
    medicoId: string,
    inicio: Date,
    fim: Date,
    ignorarConsultaId?: string,
  ): Promise<boolean> {
    const conflito = await this.db.consulta.findFirst({
      where: {
        medicoId,
        estado: { in: [EstadoConsulta.PENDENTE, EstadoConsulta.CONFIRMADA] },
        ...(ignorarConsultaId ? { id: { not: ignorarConsultaId } } : {}),
        inicio: { lt: fim },
        fim: { gt: inicio },
      },
      select: { id: true },
    });
    return Boolean(conflito);
  }

  async contarConsultasNoDia(
    medicoId: string,
    inicio: Date,
    _fim: Date,
    ignorarConsultaId?: string,
  ): Promise<number> {
    return this.db.consulta.count({
      where: {
        medicoId,
        estado: { in: [EstadoConsulta.PENDENTE, EstadoConsulta.CONFIRMADA] },
        ...(ignorarConsultaId ? { id: { not: ignorarConsultaId } } : {}),
        inicio: { gte: inicioDoDia(inicio), lte: fimDoDia(inicio) },
      },
    });
  }

  async contarConsultasFuturasPacienteMedico(
    pacienteId: string,
    medicoId: string,
    agora: Date,
    ignorarConsultaId?: string,
  ): Promise<number> {
    return this.db.consulta.count({
      where: {
        pacienteId,
        medicoId,
        estado: { in: [EstadoConsulta.PENDENTE, EstadoConsulta.CONFIRMADA] },
        ...(ignorarConsultaId ? { id: { not: ignorarConsultaId } } : {}),
        inicio: { gte: agora },
      },
    });
  }
}
