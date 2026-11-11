import type { CanalNotificacao } from '../../domain/enums';

export interface MensagemNotificacao {
  destino: string;
  assunto: string;
  corpo: string;
}

export interface ResultadoEnvio {
  sucesso: boolean;
  simulado: boolean;
  erro?: string;
}

export interface IEstrategiaNotificacao {
  readonly canal: CanalNotificacao;
  enviar(mensagem: MensagemNotificacao): Promise<ResultadoEnvio>;
}
