import { EstadoConsulta } from '../enums';
import { EstadoConsultaBase, type DadosEstadoConsulta, type ResultadoTransicao } from './EstadoConsultaBase';
import { diffHoras } from '../../lib/date';

/**
 * Estado Confirmada (RN-02): o cancelamento e gratuito com pelo menos 24 horas
 * de antecedencia. Cancelamentos tardios continuam permitidos, mas ficam
 * marcados no perfil do paciente.
 */
export class EstadoConfirmada extends EstadoConsultaBase {
  readonly nome = EstadoConsulta.CONFIRMADA;

  override confirmar(_dados: DadosEstadoConsulta): ResultadoTransicao {
    return this.recusar('A consulta ja se encontra confirmada.');
  }

  override cancelar(dados: DadosEstadoConsulta): ResultadoTransicao {
    const agora = dados.agora ?? new Date();
    const horasRestantes = diffHoras(agora, dados.inicio);

    if (horasRestantes < 24) {
      return this.permitir(EstadoConsulta.CANCELADA, {
        cancelamentoTardio: true,
        aviso:
          'Cancelamento tardio: faltam menos de 24 horas para a consulta. O cancelamento fica registado no seu perfil.',
      });
    }

    return this.permitir(EstadoConsulta.CANCELADA);
  }

  override realizar(dados: DadosEstadoConsulta): ResultadoTransicao {
    const agora = dados.agora ?? new Date();
    if (agora < dados.inicio) {
      return this.recusar('Ainda nao chegou a hora da consulta.');
    }
    return this.permitir(EstadoConsulta.REALIZADA);
  }

  override reagendar(_dados: DadosEstadoConsulta): ResultadoTransicao {
    return this.permitir(EstadoConsulta.CONFIRMADA);
  }
}
