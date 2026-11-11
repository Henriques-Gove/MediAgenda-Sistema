import { EstadoConsulta } from '../enums';
import { EstadoConsultaBase, type DadosEstadoConsulta, type ResultadoTransicao } from './EstadoConsultaBase';

/**
 * Estado Pendente (RN-07): a consulta so pode ser confirmada dentro do prazo
 * de 2 horas definido na configuracao. Depois disso a vaga e libertada.
 */
export class EstadoPendente extends EstadoConsultaBase {
  readonly nome = EstadoConsulta.PENDENTE;

  override confirmar(dados: DadosEstadoConsulta): ResultadoTransicao {
    const agora = dados.agora ?? new Date();
    if (dados.expiraConfirmacaoEm && agora > dados.expiraConfirmacaoEm) {
      return this.recusar(
        'O prazo de 2 horas para confirmar a marcacao expirou. A vaga foi libertada.',
      );
    }
    return this.permitir(EstadoConsulta.CONFIRMADA);
  }

  override cancelar(_dados: DadosEstadoConsulta): ResultadoTransicao {
    return this.permitir(EstadoConsulta.CANCELADA, {
      aviso: 'A marcacao pendente foi cancelada antes da confirmacao.',
    });
  }

  override reagendar(_dados: DadosEstadoConsulta): ResultadoTransicao {
    return this.permitir(EstadoConsulta.PENDENTE);
  }
}
