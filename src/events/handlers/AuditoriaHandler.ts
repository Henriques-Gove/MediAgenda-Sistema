import { TiposEvento } from '../../domain/enums';
import type { AuditoriaService } from '../../services/AuditoriaService';
import type { EventoDominio } from '../eventos';
import type { IObservador } from '../EventBus';

const ACOES: Record<string, string> = {
  [TiposEvento.CONSULTA_CRIADA]: 'CONSULTA_CRIADA',
  [TiposEvento.CONSULTA_CONFIRMADA]: 'CONSULTA_CONFIRMADA',
  [TiposEvento.CONSULTA_CANCELADA]: 'CONSULTA_CANCELADA',
  [TiposEvento.CONSULTA_REAGENDADA]: 'CONSULTA_REAGENDADA',
  [TiposEvento.CONSULTA_REALIZADA]: 'CONSULTA_REALIZADA',
  [TiposEvento.CONSULTA_AVALIADA]: 'CONSULTA_AVALIADA',
  [TiposEvento.UTILIZADOR_REGISTADO]: 'UTILIZADOR_REGISTADO',
  [TiposEvento.MEDICO_DESATIVADO]: 'MEDICO_DESATIVADO',
  [TiposEvento.LOGIN_REALIZADO]: 'LOGIN',
};

/**
 * Consumidor da EDA que cumpre a RNF-04. Toda a operacao critica publicada no
 * barramento fica registada sem que os servicos chamem `gravarLog()` a mao.
 */
export class AuditoriaHandler implements IObservador {
  readonly nome = 'AuditoriaHandler';

  constructor(private readonly auditoria: AuditoriaService) {}

  async aoOcorrer(evento: EventoDominio): Promise<void> {
    const acao = ACOES[evento.tipo];
    if (!acao) return;

    const consulta = evento.consulta;
    const detalhes = {
      tipoEvento: evento.tipo,
      ...(consulta
        ? {
            consultaId: consulta.consultaId,
            paciente: consulta.pacienteNome,
            medico: consulta.medicoNome,
            inicio: consulta.inicio,
            estado: consulta.estado,
            motivoCancelamento: consulta.motivoCancelamento ?? undefined,
          }
        : {}),
      ...(evento.utilizador ? { utilizador: evento.utilizador.email, perfil: evento.utilizador.perfil } : {}),
      ...(evento.meta ?? {}),
    };

    await this.auditoria.registar({
      utilizadorId: consulta?.atorId ?? evento.utilizador?.id ?? null,
      acao,
      entidade: consulta ? 'Consulta' : evento.medicoId ? 'Medico' : 'Utilizador',
      entidadeId: consulta?.consultaId ?? evento.medicoId ?? evento.utilizador?.id ?? null,
      detalhes: JSON.stringify(detalhes),
      ip: evento.ip ?? null,
    });
  }
}
