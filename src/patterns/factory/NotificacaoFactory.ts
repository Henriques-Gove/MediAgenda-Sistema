import { CanalNotificacao } from '../../domain/enums';
import type { IEnviavelEmail, IEnviavelSMS } from '../../domain/interfaces/IEnviador';
import type { IEstrategiaNotificacao } from '../../domain/notificacao/tipos';
import { EstrategiaEmail } from '../strategy/EstrategiaEmail';
import { EstrategiaSMS } from '../strategy/EstrategiaSMS';

/**
 * Factory Method: o resto do sistema pede "uma notificacao" e a fabrica decide
 * internamente qual classe concreta devolver. Adicionar WhatsApp no futuro
 * significa acrescentar um caso aqui, sem alterar os consumidores.
 */
export class NotificacaoFactory {
  constructor(
    private readonly enviadorEmail: IEnviavelEmail,
    private readonly enviadorSMS: IEnviavelSMS,
  ) {}

  criar(canal: string): IEstrategiaNotificacao {
    switch (canal) {
      case CanalNotificacao.SMS:
        return new EstrategiaSMS(this.enviadorSMS);
      case CanalNotificacao.EMAIL:
      default:
        return new EstrategiaEmail(this.enviadorEmail);
    }
  }
}
