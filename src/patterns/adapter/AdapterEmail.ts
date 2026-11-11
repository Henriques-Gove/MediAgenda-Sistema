import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import type { IEnviavelEmail } from '../../domain/interfaces/IEnviador';
import type { ResultadoEnvio } from '../../domain/notificacao/tipos';

/**
 * Adapter (padrao de projeto): traduz a interface IEnviavelEmail para a API
 * real do fornecedor SMTP. Trocar de fornecedor implica mudar apenas esta
 * classe, sem tocar na logica de negocio.
 */
export class AdapterEmail implements IEnviavelEmail {
  private transportador: Transporter | null = null;

  private obterTransportador(): Transporter {
    if (!this.transportador) {
      this.transportador = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
      });
    }
    return this.transportador;
  }

  async enviarEmail(destino: string, assunto: string, corpo: string): Promise<ResultadoEnvio> {
    if (!env.smtp.host) {
      console.log(`[EMAIL SIMULADO] Para: ${destino} | ${assunto}\n${corpo}\n`);
      return { sucesso: true, simulado: true };
    }

    try {
      await this.obterTransportador().sendMail({
        from: env.smtp.from,
        to: destino,
        subject: assunto,
        text: corpo,
        html: corpo.replace(/\n/g, '<br>'),
      });
      return { sucesso: true, simulado: false };
    } catch (erro) {
      return {
        sucesso: false,
        simulado: false,
        erro: erro instanceof Error ? erro.message : 'Falha ao enviar e-mail.',
      };
    }
  }
}
