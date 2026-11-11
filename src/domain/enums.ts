export const Perfil = {
  PACIENTE: 'PACIENTE',
  MEDICO: 'MEDICO',
  SECRETARIO: 'SECRETARIO',
  ADMINISTRADOR: 'ADMINISTRADOR',
} as const;
export type Perfil = (typeof Perfil)[keyof typeof Perfil];

export const EstadoConsulta = {
  PENDENTE: 'PENDENTE',
  CONFIRMADA: 'CONFIRMADA',
  REALIZADA: 'REALIZADA',
  CANCELADA: 'CANCELADA',
} as const;
export type EstadoConsulta = (typeof EstadoConsulta)[keyof typeof EstadoConsulta];

export const CanalNotificacao = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
} as const;
export type CanalNotificacao = (typeof CanalNotificacao)[keyof typeof CanalNotificacao];

export const EstadoNotificacao = {
  ENVIADA: 'ENVIADA',
  SIMULADA: 'SIMULADA',
  FALHADA: 'FALHADA',
} as const;
export type EstadoNotificacao = (typeof EstadoNotificacao)[keyof typeof EstadoNotificacao];

export const TiposEvento = {
  CONSULTA_CRIADA: 'ConsultaCriada',
  CONSULTA_CONFIRMADA: 'ConsultaConfirmada',
  CONSULTA_CANCELADA: 'ConsultaCancelada',
  CONSULTA_REAGENDADA: 'ConsultaReagendada',
  CONSULTA_REALIZADA: 'ConsultaRealizada',
  CONSULTA_AVALIADA: 'ConsultaAvaliada',
  LEMBRETE_DEVIDO: 'LembreteDevido',
  UTILIZADOR_REGISTADO: 'UtilizadorRegistado',
  MEDICO_DESATIVADO: 'MedicoDesativado',
  LOGIN_REALIZADO: 'LoginRealizado',
} as const;
export type TipoEvento = (typeof TiposEvento)[keyof typeof TiposEvento];

export const DiasSemana = [
  'Domingo',
  'Segunda-feira',
  'Terca-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sabado',
] as const;

export const RotulosEstado: Record<EstadoConsulta, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADA: 'Confirmada',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
};

export const CoresEstado: Record<EstadoConsulta, string> = {
  PENDENTE: 'warning',
  CONFIRMADA: 'success',
  REALIZADA: 'primary',
  CANCELADA: 'danger',
};
