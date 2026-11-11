import { EstadoConsulta } from '../enums';
import { EstadoConsultaBase } from './EstadoConsultaBase';

/** Estado final: uma consulta realizada nunca volta a cancelada. */
export class EstadoRealizada extends EstadoConsultaBase {
  readonly nome = EstadoConsulta.REALIZADA;

  override get permiteAvaliacao(): boolean {
    return true;
  }

  override get eFinal(): boolean {
    return true;
  }
}
