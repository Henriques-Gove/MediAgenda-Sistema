import type { ConfiguracaoSistema } from '../../config/ConfiguracaoSistema';
import { horaParaMinutos } from '../../lib/date';
import type { PedidoMarcacao, ResultadoValidacao } from './PedidoMarcacao';
import { ValidacaoHandler } from './ValidacaoHandler';

/**
 * RN-09: nao e permitido marcar fora do horario da clinica.
 * RF-04: tambem valida a disponibilidade semanal e os bloqueios do medico.
 */
export class HorarioFuncionamentoHandler extends ValidacaoHandler {
  constructor(private readonly config: ConfiguracaoSistema) {
    super();
  }

  protected async verificar(pedido: PedidoMarcacao): Promise<ResultadoValidacao> {
    const { abertura, fecho, dias } = this.config.horarioFuncionamento();
    const dia = pedido.inicio.getDay();
    const inicioMin = pedido.inicio.getHours() * 60 + pedido.inicio.getMinutes();
    const fimMin = pedido.fim.getHours() * 60 + pedido.fim.getMinutes();

    if (!dias.includes(dia)) {
      return {
        valido: false,
        regra: 'RN-09',
        motivo: 'A clinica nao funciona neste dia da semana.',
      };
    }

    if (inicioMin < horaParaMinutos(abertura) || fimMin > horaParaMinutos(fecho)) {
      return {
        valido: false,
        regra: 'RN-09',
        motivo: `O horario de funcionamento e das ${abertura} as ${fecho}.`,
      };
    }

    if (!pedido.medico.ativo) {
      return {
        valido: false,
        regra: 'RF-04',
        motivo: 'Este medico encontra-se temporariamente inactivo.',
      };
    }

    const janelas = pedido.medico.disponibilidades.filter((d) => d.diaSemana === dia);
    const dentroDeUmaJanela = janelas.some(
      (janela) =>
        inicioMin >= horaParaMinutos(janela.horaInicio) &&
        fimMin <= horaParaMinutos(janela.horaFim),
    );

    if (!dentroDeUmaJanela) {
      return {
        valido: false,
        regra: 'RF-04',
        motivo: 'O medico nao tem disponibilidade definida para este horario.',
      };
    }

    const bloqueado = pedido.medico.bloqueios.some(
      (bloqueio) => pedido.inicio < bloqueio.fim && pedido.fim > bloqueio.inicio,
    );

    if (bloqueado) {
      return {
        valido: false,
        regra: 'RF-04',
        motivo: 'O medico tem um bloqueio/férias neste periodo.',
      };
    }

    return { valido: true };
  }
}
