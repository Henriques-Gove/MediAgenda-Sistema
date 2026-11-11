import type { PedidoMarcacao, PortaAgenda, ResultadoValidacao } from './PedidoMarcacao';
import { ValidacaoHandler } from './ValidacaoHandler';

/** RN-05: um medico nao pode ter duas consultas simultaneas. */
export class ConflitoAgendaHandler extends ValidacaoHandler {
  constructor(private readonly porta: PortaAgenda) {
    super();
  }

  protected async verificar(pedido: PedidoMarcacao): Promise<ResultadoValidacao> {
    const existe = await this.porta.existeConflito(
      pedido.medico.id,
      pedido.inicio,
      pedido.fim,
      pedido.ignorarConsultaId,
    );

    if (existe) {
      return {
        valido: false,
        regra: 'RN-05',
        motivo: 'O medico ja tem uma consulta marcada para este horario.',
      };
    }
    return { valido: true };
  }
}
