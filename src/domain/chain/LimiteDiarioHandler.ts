import type { PedidoMarcacao, PortaAgenda, ResultadoValidacao } from './PedidoMarcacao';
import { ValidacaoHandler } from './ValidacaoHandler';

/** RN-03: limite diario de consultas definido por cada medico (padrao 10). */
export class LimiteDiarioHandler extends ValidacaoHandler {
  constructor(private readonly porta: PortaAgenda) {
    super();
  }

  protected async verificar(pedido: PedidoMarcacao): Promise<ResultadoValidacao> {
    const total = await this.porta.contarConsultasNoDia(
      pedido.medico.id,
      pedido.inicio,
      pedido.fim,
      pedido.ignorarConsultaId,
    );

    if (total >= pedido.medico.maxConsultasDia) {
      return {
        valido: false,
        regra: 'RN-03',
        motivo: `Este medico ja atingiu o limite de ${pedido.medico.maxConsultasDia} consultas para este dia.`,
      };
    }
    return { valido: true };
  }
}
