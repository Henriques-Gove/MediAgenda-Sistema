import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { ErroNaoEncontrado, ErroValidacao } from '../domain/errors';
import { combinarDataHora } from '../lib/date';
import type { AgendaService, SlotHorario } from './AgendaService';

export const listaEsperaInclude = {
  paciente: { include: { utilizador: true } },
  medico: { include: { utilizador: true } },
  especialidade: true,
} satisfies Prisma.ListaEsperaInclude;

export type ListaEsperaComRelacoes = Prisma.ListaEsperaGetPayload<{
  include: typeof listaEsperaInclude;
}>;

export interface DadosListaEspera {
  medicoId: string;
  especialidadeId?: string | null;
  dataPreferida?: string | null;
  periodo?: string | null;
}

const PERIODOS = new Set(['MANHA', 'TARDE', 'DIA']);

/** Lista de espera com sugestão de horários alternativos. */
export class ListaEsperaService {
  constructor(
    private readonly db: PrismaClient = prismaPadrao,
    private readonly agenda?: AgendaService,
  ) {}

  async inscrever(pacienteId: string, dados: DadosListaEspera): Promise<ListaEsperaComRelacoes> {
    if (!dados.medicoId) throw new ErroValidacao('Escolha o médico pretendido.');

    const medico = await this.db.medico.findUnique({ where: { id: dados.medicoId } });
    if (!medico) throw new ErroNaoEncontrado('Médico não encontrado.');

    const periodo = dados.periodo?.toUpperCase() ?? null;
    if (periodo && !PERIODOS.has(periodo)) {
      throw new ErroValidacao('Escolha um período válido.');
    }

    const existente = await this.db.listaEspera.findFirst({
      where: { pacienteId, medicoId: dados.medicoId, estado: 'ATIVA' },
    });
    if (existente) {
      throw new ErroValidacao('Já está na lista de espera para este médico.');
    }

    return this.db.listaEspera.create({
      data: {
        pacienteId,
        medicoId: dados.medicoId,
        especialidadeId: dados.especialidadeId || null,
        dataPreferida: dados.dataPreferida
          ? combinarDataHora(dados.dataPreferida, '00:00')
          : null,
        periodo,
        estado: 'ATIVA',
      },
      include: listaEsperaInclude,
    });
  }

  async listarPorPaciente(pacienteId: string): Promise<ListaEsperaComRelacoes[]> {
    return this.db.listaEspera.findMany({
      where: { pacienteId },
      include: listaEsperaInclude,
      orderBy: { criadoEm: 'desc' },
      take: 50,
    });
  }

  async listarAtivas(medicoId?: string): Promise<ListaEsperaComRelacoes[]> {
    return this.db.listaEspera.findMany({
      where: {
        estado: 'ATIVA',
        ...(medicoId ? { medicoId } : {}),
      },
      include: listaEsperaInclude,
      orderBy: { criadoEm: 'asc' },
      take: 200,
    });
  }

  async cancelar(id: string, pacienteId?: string): Promise<void> {
    const resultado = await this.db.listaEspera.updateMany({
      where: {
        id,
        estado: 'ATIVA',
        ...(pacienteId ? { pacienteId } : {}),
      },
      data: { estado: 'CANCELADA' },
    });
    if (!resultado.count) {
      throw new ErroNaoEncontrado('Pedido de lista de espera não encontrado.');
    }
  }

  /** Devolve as primeiras vagas livres para sugerir ao paciente. */
  async sugerirHorarios(medicoId: string, limite = 6): Promise<SlotHorario[]> {
    if (!this.agenda) return [];
    return this.agenda.proximasVagas(medicoId, limite);
  }
}
