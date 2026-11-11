import type { ConfiguracaoSistema } from '../../config/ConfiguracaoSistema';
import { AntecedenciaHandler } from './AntecedenciaHandler';
import { ConflitoAgendaHandler } from './ConflitoAgendaHandler';
import { HorarioFuncionamentoHandler } from './HorarioFuncionamentoHandler';
import { LimiteDiarioHandler } from './LimiteDiarioHandler';
import { LimitePacienteHandler } from './LimitePacienteHandler';
import type { PedidoMarcacao, PortaAgenda, ResultadoValidacao } from './PedidoMarcacao';

/**
 * Monta a cadeia na ordem definida na apresentacao:
 * RN-01 -> RN-09 -> RN-05 -> RN-03 -> RN-06.
 * Regras simples e baratas correm antes das que consultam a base de dados.
 */
export class CadeiaValidacaoMarcacao {
  private readonly primeiro: AntecedenciaHandler;

  constructor(porta: PortaAgenda, config: ConfiguracaoSistema) {
    this.primeiro = new AntecedenciaHandler(config);
    const horario = this.primeiro.definirProximo(new HorarioFuncionamentoHandler(config));
    const conflito = horario.definirProximo(new ConflitoAgendaHandler(porta));
    const limiteDiario = conflito.definirProximo(new LimiteDiarioHandler(porta));
    limiteDiario.definirProximo(new LimitePacienteHandler(porta, config));
  }

  validar(pedido: PedidoMarcacao): Promise<ResultadoValidacao> {
    return this.primeiro.validar(pedido);
  }
}
