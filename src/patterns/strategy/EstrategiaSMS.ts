import { CanalNotificacao } from '../../domain/enums';
import type { IEnviavelSMS } from '../../domain/interfaces/IEnviador';
import type {
  IEstrategiaNotificacao,
  MensagemNotificacao,
  ResultadoEnvio,
} from '../../domain/notificacao/tipos';

/** Strategy concreta: notificacao por SMS. */
export class EstrategiaSMS implements IEstrategiaNotificacao {
  readonly canal = CanalNotificacao.SMS;

  constructor(private readonly enviador: IEnviavelSMS) {}

  enviar(mensagem: MensagemNotificacao): Promise<ResultadoEnvio> {
    return this.enviador.enviarSMS(mensagem.destino, `${mensagem.assunto}\n${mensagem.corpo}`);
  }
}
