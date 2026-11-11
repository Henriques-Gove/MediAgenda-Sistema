import { CanalNotificacao } from '../../domain/enums';
import type { IEnviavelEmail } from '../../domain/interfaces/IEnviador';
import type {
  IEstrategiaNotificacao,
  MensagemNotificacao,
  ResultadoEnvio,
} from '../../domain/notificacao/tipos';

/** Strategy concreta: notificacao por e-mail. */
export class EstrategiaEmail implements IEstrategiaNotificacao {
  readonly canal = CanalNotificacao.EMAIL;

  constructor(private readonly enviador: IEnviavelEmail) {}

  enviar(mensagem: MensagemNotificacao): Promise<ResultadoEnvio> {
    return this.enviador.enviarEmail(mensagem.destino, mensagem.assunto, mensagem.corpo);
  }
}
