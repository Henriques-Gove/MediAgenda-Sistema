import type { ConfiguracaoSistema } from '../../config/ConfiguracaoSistema';
import type { PedidoMarcacao, ResultadoValidacao } from './PedidoMarcacao';
import { ValidacaoHandler } from './ValidacaoHandler';

/** RN-01: a consulta tem de ser marcada com pelo menos 1 hora de antecedencia. */
export class AntecedenciaHandler extends ValidacaoHandler {
  constructor(private readonly config: ConfiguracaoSistema) {
    super();
  }

  protected async verificar(pedido: PedidoMarcacao): Promise<ResultadoValidacao> {
    const minimoHoras = this.config.obterNumero('antecedencia_minima_horas');
    const diferencaHoras = (pedido.inicio.getTime() - pedido.agora.getTime()) / 3_600_000;

    if (diferencaHoras < minimoHoras) {
      return {
        valido: false,
        regra: 'RN-01',
        motivo: `A consulta tem de ser marcada com pelo menos ${minimoHoras} hora(s) de antecedencia.`,
      };
    }
    return { valido: true };
  }
}
