import type { Comando } from './Comando';
import type { ConsultaService, ConsultaComRelacoes } from '../../services/ConsultaService';

export interface DadosAcaoConsulta {
  consultaId: string;
  atorId: string | null;
  atorPerfil?: string | null;
}

/**
 * Command (padrao de projeto): encapsula o cancelamento. Quem cancelou,
 * quando e por que motivo fica registado para auditoria (RNF-04).
 */
export class CancelarConsultaCommand implements Comando<ConsultaComRelacoes> {
  constructor(
    private readonly consultas: ConsultaService,
    private readonly dados: DadosAcaoConsulta & { motivo: string },
  ) {}

  descricao(): string {
    return `Cancelar consulta ${this.dados.consultaId} (ator: ${this.dados.atorId ?? 'sistema'}, motivo: ${this.dados.motivo})`;
  }

  executar(): Promise<ConsultaComRelacoes> {
    return this.consultas.cancelar(
      this.dados.consultaId,
      this.dados.atorId,
      this.dados.motivo,
      this.dados.atorPerfil ?? null,
    );
  }
}

export class ConfirmarConsultaCommand implements Comando<ConsultaComRelacoes> {
  constructor(
    private readonly consultas: ConsultaService,
    private readonly dados: DadosAcaoConsulta,
  ) {}

  descricao(): string {
    return `Confirmar consulta ${this.dados.consultaId}`;
  }

  executar(): Promise<ConsultaComRelacoes> {
    return this.consultas.confirmar(
      this.dados.consultaId,
      this.dados.atorId,
      this.dados.atorPerfil ?? null,
    );
  }
}

export class RealizarConsultaCommand implements Comando<ConsultaComRelacoes> {
  constructor(
    private readonly consultas: ConsultaService,
    private readonly dados: DadosAcaoConsulta,
  ) {}

  descricao(): string {
    return `Marcar consulta ${this.dados.consultaId} como realizada`;
  }

  executar(): Promise<ConsultaComRelacoes> {
    return this.consultas.realizar(
      this.dados.consultaId,
      this.dados.atorId,
      this.dados.atorPerfil ?? null,
    );
  }
}
