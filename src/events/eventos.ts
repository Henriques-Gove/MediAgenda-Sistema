import type { EstadoConsulta, TipoEvento } from '../domain/enums';

export interface ConsultaEventoDados {
  consultaId: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteEmail: string;
  pacienteTelefone: string;
  preferenciaPaciente: string;
  medicoId: string;
  medicoNome: string;
  medicoEmail: string;
  medicoTelefone: string;
  especialidade: string | null;
  inicio: Date;
  fim: Date;
  estado: EstadoConsulta;
  motivo?: string | null;
  motivoCancelamento?: string | null;
  cancelamentoTardio?: boolean;
  confirmacaoToken?: string | null;
  expiraConfirmacaoEm?: Date | null;
  atorId?: string | null;
  atorPerfil?: string | null;
}

export interface EventoDominio {
  tipo: TipoEvento;
  ocorridoEm: Date;
  consulta?: ConsultaEventoDados;
  utilizador?: { id: string; nome: string; email: string; perfil: string };
  medicoId?: string;
  ip?: string;
  meta?: Record<string, unknown>;
}
