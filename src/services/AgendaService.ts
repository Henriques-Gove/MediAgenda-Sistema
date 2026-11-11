import type { PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { ConfiguracaoSistema } from '../config/ConfiguracaoSistema';
import { ErroValidacao } from '../domain/errors';
import {
  adicionarDias,
  combinarDataHora,
  fimDaSemana,
  fimDoDia,
  fimDoMes,
  formatarDataInput,
  horaParaMinutos,
  inicioDaSemana,
  inicioDoDia,
  inicioDoMes,
  minutosParaHora,
  somarHoras,
} from '../lib/date';
import type { MedicoService, MedicoComRelacoes } from './MedicoService';
import type { ConsultaService, ConsultaComRelacoes } from './ConsultaService';

export interface SlotHorario {
  hora: string;
  inicio: Date;
  fim: Date;
  disponivel: boolean;
  motivo?: string;
}

export interface DisponibilidadeInput {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
}

/** Servico de agenda: disponibilidade, bloqueios e calculo de vagas (RF-04). */
export class AgendaService {
  constructor(
    private readonly db: PrismaClient = prismaPadrao,
    private readonly medicos: MedicoService,
    private readonly consultas: ConsultaService,
    private readonly config: ConfiguracaoSistema = ConfiguracaoSistema.getInstance(),
  ) {}

  async obterAgenda(medicoId: string): Promise<MedicoComRelacoes> {
    return this.medicos.obterPorId(medicoId);
  }

  async definirDisponibilidade(
    medicoId: string,
    disponibilidades: DisponibilidadeInput[],
  ): Promise<void> {
    for (const item of disponibilidades) {
      if (item.diaSemana < 0 || item.diaSemana > 6) {
        throw new ErroValidacao('Dia da semana invalido.');
      }
      if (horaParaMinutos(item.horaInicio) >= horaParaMinutos(item.horaFim)) {
        throw new ErroValidacao('A hora de inicio deve ser anterior a hora de fim.');
      }
    }

    const porDia = new Map<number, DisponibilidadeInput[]>();
    for (const item of disponibilidades) {
      const lista = porDia.get(item.diaSemana) ?? [];
      lista.push(item);
      porDia.set(item.diaSemana, lista);
    }

    for (const [dia, janelas] of porDia) {
      janelas.sort((a, b) => horaParaMinutos(a.horaInicio) - horaParaMinutos(b.horaInicio));
      for (let i = 1; i < janelas.length; i += 1) {
        if (horaParaMinutos(janelas[i]!.horaInicio) < horaParaMinutos(janelas[i - 1]!.horaFim)) {
          throw new ErroValidacao(
            `Existem janelas sobrepostas no dia ${dia}. Ajuste os horarios.`,
          );
        }
      }
    }

    await this.db.$transaction(async (tx) => {
      await tx.disponibilidade.deleteMany({ where: { medicoId } });
      if (disponibilidades.length) {
        await tx.disponibilidade.createMany({
          data: disponibilidades.map((item) => ({
            medicoId,
            diaSemana: item.diaSemana,
            horaInicio: item.horaInicio,
            horaFim: item.horaFim,
          })),
        });
      }
    });
  }

  async bloquearPeriodo(
    medicoId: string,
    inicio: Date,
    fim: Date,
    motivo: string,
  ): Promise<void> {
    if (inicio >= fim) throw new ErroValidacao('O inicio do bloqueio deve ser anterior ao fim.');
    if (!motivo?.trim()) throw new ErroValidacao('Indique o motivo do bloqueio.');
    await this.db.bloqueio.create({
      data: { medicoId, inicio, fim, motivo: motivo.trim() },
    });
  }

  async removerBloqueio(bloqueioId: string, medicoId: string): Promise<void> {
    await this.db.bloqueio.deleteMany({ where: { id: bloqueioId, medicoId } });
  }

  async listarBloqueios(medicoId: string) {
    return this.db.bloqueio.findMany({
      where: { medicoId, fim: { gte: new Date() } },
      orderBy: { inicio: 'asc' },
    });
  }

  /**
   * Gera as vagas de um dia combinando: horario da clinica (RN-09),
   * disponibilidade semanal do medico, bloqueios/férias, consultas existentes
   * (RN-05) e antecedencia minima (RN-01).
   */
  async gerarSlots(
    medicoId: string,
    data: Date,
    ignorarConsultaId?: string,
  ): Promise<SlotHorario[]> {
    const medico = await this.medicos.obterPorId(medicoId);
    const { abertura, fecho, dias } = this.config.horarioFuncionamento();
    const dia = data.getDay();
    if (!dias.includes(dia)) return [];

    const duracao = Math.min(120, Math.max(60, medico.duracaoConsultaMinutos));
    const aberturaMin = horaParaMinutos(abertura);
    const fechoMin = horaParaMinutos(fecho);
    const agora = new Date();
    const antecedencia = somarHoras(agora, this.config.obterNumero('antecedencia_minima_horas'));

    const consultasDoDia = await this.db.consulta.findMany({
      where: {
        medicoId,
        estado: { in: ['PENDENTE', 'CONFIRMADA'] },
        ...(ignorarConsultaId ? { id: { not: ignorarConsultaId } } : {}),
        inicio: { gte: inicioDoDia(data), lte: fimDoDia(data) },
      },
      select: { inicio: true, fim: true },
    });

    const bloqueios = medico.bloqueios;

    const janelas = medico.disponibilidades.filter((d) => d.diaSemana === dia);
    const slots = new Map<string, SlotHorario>();

    for (const janela of janelas) {
      const inicioJanela = Math.max(horaParaMinutos(janela.horaInicio), aberturaMin);
      const fimJanela = Math.min(horaParaMinutos(janela.horaFim), fechoMin);

      for (let minuto = inicioJanela; minuto + duracao <= fimJanela; minuto += duracao) {
        const hora = minutosParaHora(minuto);
        const inicio = combinarDataHora(formatarDataInput(data), hora);
        const fim = new Date(inicio.getTime() + duracao * 60_000);

        let disponivel = true;
        let motivo: string | undefined;

        if (inicio < antecedencia) {
          disponivel = false;
          motivo = 'Antecedência mínima não cumprida.';
        } else if (bloqueios.some((b) => inicio < b.fim && fim > b.inicio)) {
          disponivel = false;
          motivo = 'Medico indisponivel (bloqueio/férias).';
        } else if (consultasDoDia.some((c) => inicio < c.fim && fim > c.inicio)) {
          disponivel = false;
          motivo = 'Horario ja ocupado.';
        }

        const existente = slots.get(hora);
        if (!existente || (disponivel && !existente.disponivel)) {
          slots.set(hora, { hora, inicio, fim, disponivel, motivo });
        }
      }
    }

    return [...slots.values()].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }

  async agendaDoDia(medicoId: string, data: Date): Promise<ConsultaComRelacoes[]> {
    const consultas = await this.consultas.listar({
      medicoId,
      desde: inicioDoDia(data),
      ate: fimDoDia(data),
      limite: 100,
    });
    return consultas.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }

  async agendaSemanal(
    medicoId: string,
    dataReferencia: Date,
  ): Promise<Array<{ data: Date; consultas: ConsultaComRelacoes[] }>> {
    const base = inicioDaSemana(dataReferencia);
    const consultas = await this.consultas.listar({
      medicoId,
      desde: base,
      ate: fimDaSemana(dataReferencia),
      limite: 500,
    });

    return Array.from({ length: 7 }, (_valor, indice) => {
      const data = adicionarDias(base, indice);
      return {
        data,
        consultas: consultas
          .filter((consulta) => consulta.inicio >= inicioDoDia(data) && consulta.inicio <= fimDoDia(data))
          .sort((a, b) => a.inicio.getTime() - b.inicio.getTime()),
      };
    });
  }

  /**
   * Devolve o mês organizado em semanas completas (segunda a domingo),
   * incluindo os dias das semanas adjacentes para uma grelha estável.
   */
  async agendaMensal(
    medicoId: string,
    dataReferencia: Date,
  ): Promise<{
    semanas: Array<Array<{ data: Date; noMes: boolean; consultas: ConsultaComRelacoes[] }>>;
    inicio: Date;
    fim: Date;
  }> {
    const inicio = inicioDaSemana(inicioDoMes(dataReferencia));
    const fim = fimDaSemana(fimDoMes(dataReferencia));
    const consultas = await this.consultas.listar({
      medicoId,
      desde: inicio,
      ate: fim,
      limite: 1000,
    });

    const semanas: Array<Array<{ data: Date; noMes: boolean; consultas: ConsultaComRelacoes[] }>> = [];
    let cursor = inicio;
    while (cursor <= fim) {
      const semana = Array.from({ length: 7 }, (_valor, indice) => {
        const data = adicionarDias(cursor, indice);
        return {
          data,
          noMes:
            data.getMonth() === dataReferencia.getMonth() &&
            data.getFullYear() === dataReferencia.getFullYear(),
          consultas: consultas
            .filter(
              (consulta) =>
                consulta.inicio >= inicioDoDia(data) && consulta.inicio <= fimDoDia(data),
            )
            .sort((a, b) => a.inicio.getTime() - b.inicio.getTime()),
        };
      });
      semanas.push(semana);
      cursor = adicionarDias(cursor, 7);
    }

    return { semanas, inicio, fim };
  }

  /** Procura as primeiras vagas livres nos próximos dias, para sugerir alternativas. */
  async proximasVagas(medicoId: string, limite = 6, dias = 21): Promise<SlotHorario[]> {
    const resultado: SlotHorario[] = [];
    const hoje = new Date();
    for (let indice = 1; indice <= dias && resultado.length < limite; indice += 1) {
      const data = adicionarDias(hoje, indice);
      const slots = await this.gerarSlots(medicoId, data);
      for (const slot of slots) {
        if (!slot.disponivel) continue;
        resultado.push(slot);
        if (resultado.length >= limite) break;
      }
    }
    return resultado;
  }

  async proximasConsultas(medicoId: string, limite = 10): Promise<ConsultaComRelacoes[]> {
    const consultas = await this.consultas.listar({
      medicoId,
      desde: new Date(),
      estado: 'CONFIRMADA',
      limite,
    });
    return consultas.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }
}
