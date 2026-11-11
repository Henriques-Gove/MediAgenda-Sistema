export interface DisponibilidadeSemana {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
}

export interface BloqueioAgenda {
  inicio: Date;
  fim: Date;
  motivo: string;
}

export interface MedicoAgendaInfo {
  id: string;
  nome: string;
  ativo: boolean;
  maxConsultasDia: number;
  duracaoConsultaMinutos: number;
  disponibilidades: DisponibilidadeSemana[];
  bloqueios: BloqueioAgenda[];
}

export interface PedidoMarcacao {
  pacienteId: string;
  medico: MedicoAgendaInfo;
  inicio: Date;
  fim: Date;
  agora: Date;
  ignorarConsultaId?: string;
}

export interface ResultadoValidacao {
  valido: boolean;
  motivo?: string;
  regra?: string;
}

/**
 * Porta (DIP): a cadeia depende desta abstracao, nunca do Prisma em concreto.
 * Isto permite testar cada elo com uma implementacao em memoria.
 */
export interface PortaAgenda {
  existeConflito(
    medicoId: string,
    inicio: Date,
    fim: Date,
    ignorarConsultaId?: string,
  ): Promise<boolean>;
  contarConsultasNoDia(
    medicoId: string,
    inicio: Date,
    fim: Date,
    ignorarConsultaId?: string,
  ): Promise<number>;
  contarConsultasFuturasPacienteMedico(
    pacienteId: string,
    medicoId: string,
    agora: Date,
    ignorarConsultaId?: string,
  ): Promise<number>;
}
