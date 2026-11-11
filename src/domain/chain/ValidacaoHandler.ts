import type { PedidoMarcacao, ResultadoValidacao } from './PedidoMarcacao';

/**
 * Padrao Chain of Responsibility: cada regra de negocio e um elo independente.
 * Se um elo rejeitar, a cadeia para imediatamente e devolve o motivo exacto.
 */
export abstract class ValidacaoHandler {
  private proximo: ValidacaoHandler | null = null;

  definirProximo<T extends ValidacaoHandler>(proximo: T): T {
    this.proximo = proximo;
    return proximo;
  }

  async validar(pedido: PedidoMarcacao): Promise<ResultadoValidacao> {
    const resultado = await this.verificar(pedido);
    if (!resultado.valido) return resultado;
    if (!this.proximo) return { valido: true };
    return this.proximo.validar(pedido);
  }

  protected abstract verificar(pedido: PedidoMarcacao): Promise<ResultadoValidacao>;
}
