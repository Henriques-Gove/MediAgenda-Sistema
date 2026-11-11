import { EstadoConsulta } from '../enums';
import { EstadoConsultaBase } from './EstadoConsultaBase';
import { EstadoPendente } from './EstadoPendente';
import { EstadoConfirmada } from './EstadoConfirmada';
import { EstadoRealizada } from './EstadoRealizada';
import { EstadoCancelada } from './EstadoCancelada';

const ESTADOS: Record<EstadoConsulta, EstadoConsultaBase> = {
  [EstadoConsulta.PENDENTE]: new EstadoPendente(),
  [EstadoConsulta.CONFIRMADA]: new EstadoConfirmada(),
  [EstadoConsulta.REALIZADA]: new EstadoRealizada(),
  [EstadoConsulta.CANCELADA]: new EstadoCancelada(),
};

/** Factory simples que traduz o valor persistido para o objeto de estado. */
export class EstadoFactory {
  static criar(estado: string): EstadoConsultaBase {
    return ESTADOS[estado as EstadoConsulta] ?? ESTADOS[EstadoConsulta.CANCELADA];
  }

  static todos(): EstadoConsultaBase[] {
    return Object.values(ESTADOS);
  }
}
