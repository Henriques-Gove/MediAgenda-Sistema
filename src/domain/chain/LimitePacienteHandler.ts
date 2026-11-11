import type { ConfiguracaoSistema } from '../../config/ConfiguracaoSistema';
import type { PedidoMarcacao, PortaAgenda, ResultadoValidacao } from './PedidoMarcacao';
import { ValidacaoHandler } from './ValidacaoHandler';

/**
 * RN-06: um paciente nao pode ter mais de 3 consultas futuras activas ao
 * mesmo tempo com o mesmo medico (limite configuravel).
 */
export class LimitePacienteHandler extends ValidacaoHandler {
  constructor(
    private readonly porta: PortaAgenda,
    private readonly config: ConfiguracaoSistema,
  ) {
    super();
  }

  protected async verificar(pedido: PedidoMarcacao): Promise<ResultadoValidacao> {
    const limite = this.config.obterNumero('max_consultas_paciente_medico');
    const total = await this.porta.contarConsultasFuturasPacienteMedico(
      pedido.pacienteId,
      pedido.medico.id,
      pedido.agora,
      pedido.ignorarConsultaId,
    );

    if (total >= limite) {
      return {
        valido: false,
        regra: 'RN-06',
        motivo: `Nao pode ter mais de ${limite} consultas futuras activas com o mesmo medico.`,
      };
    }
    return { valido: true };
  }
}
