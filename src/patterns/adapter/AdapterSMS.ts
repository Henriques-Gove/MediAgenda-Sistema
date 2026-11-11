import { env } from '../../config/env';
import type { IEnviavelSMS } from '../../domain/interfaces/IEnviador';
import type { ResultadoEnvio } from '../../domain/notificacao/tipos';

/**
 * Adapter para a API externa de SMS. Sem SMS_API_URL configurado, o envio e
 * simulado (registado em consola), permitindo demonstrar o fluxo completo.
 */
export class AdapterSMS implements IEnviavelSMS {
  async enviarSMS(destino: string, mensagem: string): Promise<ResultadoEnvio> {
    if (!env.sms.url) {
      console.log(`[SMS SIMULADO] Para: ${destino} | ${mensagem}\n`);
      return { sucesso: true, simulado: true };
    }

    try {
      const resposta = await fetch(env.sms.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.sms.apiKey ? { Authorization: `Bearer ${env.sms.apiKey}` } : {}),
        },
        body: JSON.stringify({ from: env.sms.from, to: destino, message: mensagem }),
      });

      if (!resposta.ok) {
        return { sucesso: false, simulado: false, erro: `API SMS respondeu ${resposta.status}` };
      }
      return { sucesso: true, simulado: false };
    } catch (erro) {
      return {
        sucesso: false,
        simulado: false,
        erro: erro instanceof Error ? erro.message : 'Falha ao enviar SMS.',
      };
    }
  }
}
