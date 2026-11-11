import type { EstadoConsulta } from '../enums';

export interface DadosEstadoConsulta {
  id: string;
  inicio: Date;
  criadaEm: Date;
  expiraConfirmacaoEm?: Date | null;
  agora?: Date;
}

export interface ResultadoTransicao {
  permitido: boolean;
  novoEstado?: EstadoConsulta;
  motivo?: string;
  aviso?: string;
  cancelamentoTardio?: boolean;
}

/**
 * Padrao State: cada estado da consulta e uma classe que sabe exactamente
 * quais transicoes sao validas a partir de si. A logica de decisao vive num
 * unico lugar (a classe do estado) e nao espalhada por varios `if`.
 */
export abstract class EstadoConsultaBase {
  abstract readonly nome: EstadoConsulta;

  confirmar(_dados: DadosEstadoConsulta): ResultadoTransicao {
    return this.recusar('Nao e possivel confirmar uma consulta neste estado.');
  }

  cancelar(_dados: DadosEstadoConsulta): ResultadoTransicao {
    return this.recusar('Nao e possivel cancelar uma consulta neste estado.');
  }

  realizar(_dados: DadosEstadoConsulta): ResultadoTransicao {
    return this.recusar('Nao e possivel realizar uma consulta neste estado.');
  }

  reagendar(_dados: DadosEstadoConsulta): ResultadoTransicao {
    return this.recusar('Nao e possivel reagendar uma consulta neste estado.');
  }

  get permiteAvaliacao(): boolean {
    return false;
  }

  get eFinal(): boolean {
    return false;
  }

  protected permitir(novoEstado?: EstadoConsulta, extra: Partial<ResultadoTransicao> = {}): ResultadoTransicao {
    return { permitido: true, novoEstado, ...extra };
  }

  protected recusar(motivo: string): ResultadoTransicao {
    return { permitido: false, motivo };
  }
}
