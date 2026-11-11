import type { ResultadoEnvio } from '../notificacao/tipos';

/**
 * ISP (Interface Segregation Principle): em vez de uma interface gorda
 * `Notificavel` com enviarEmail/enviarSMS/enviarPush, cada tecnologia tem a
 * sua interface pequena. Quem so envia SMS nao e obrigado a implementar e-mail.
 */
export interface IEnviavelEmail {
  enviarEmail(destino: string, assunto: string, corpo: string): Promise<ResultadoEnvio>;
}

export interface IEnviavelSMS {
  enviarSMS(destino: string, mensagem: string): Promise<ResultadoEnvio>;
}
