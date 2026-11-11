import { EstadoConsulta } from '../enums';
import { EstadoConsultaBase } from './EstadoConsultaBase';

/** Estado final: uma consulta cancelada nao pode ser confirmada nem realizada. */
export class EstadoCancelada extends EstadoConsultaBase {
  readonly nome = EstadoConsulta.CANCELADA;

  override get eFinal(): boolean {
    return true;
  }
}
