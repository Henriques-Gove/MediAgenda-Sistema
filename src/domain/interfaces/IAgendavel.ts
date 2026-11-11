/**
 * ISP: o Paciente so precisa de marcar/cancelar/reagendar. O Medico/Secretario
 * usa uma interface diferente para gerir a agenda. Nenhuma classe e obrigada a
 * implementar metodos que nao usa.
 */
export interface DadosMarcacao {
  pacienteId: string;
  medicoId: string;
  especialidadeId?: string | null;
  inicio: Date;
  fim: Date;
  motivo?: string | null;
  atorId: string;
}

export interface DadosReagendamento {
  consultaId: string;
  novoInicio: Date;
  novoFim: Date;
  atorId: string;
  motivo?: string | null;
}

export interface IAgendavel {
  marcar(dados: DadosMarcacao): Promise<{ id: string }>;
  cancelar(consultaId: string, atorId: string, motivo: string): Promise<void>;
  reagendar(dados: DadosReagendamento): Promise<void>;
}

export interface IGerivelAgenda {
  definirDisponibilidade(
    medicoId: string,
    disponibilidades: Array<{ diaSemana: number; horaInicio: string; horaFim: string }>,
  ): Promise<void>;
  bloquearPeriodo(medicoId: string, inicio: Date, fim: Date, motivo: string): Promise<void>;
}
