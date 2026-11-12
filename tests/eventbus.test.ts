import { describe, expect, it, vi } from 'vitest';
import { EventBus, type IObservador } from '../src/events/EventBus';
import { TiposEvento } from '../src/domain/enums';
import type { EventoDominio } from '../src/events/eventos';

function eventoDeTeste(): EventoDominio {
  return {
    tipo: TiposEvento.CONSULTA_CRIADA,
    ocorridoEm: new Date('2026-11-12T09:00:00.000Z'),
    consulta: {
      consultaId: 'consulta-1',
      pacienteId: 'paciente-1',
      pacienteNome: 'Ana Silva',
      pacienteEmail: 'ana@exemplo.co.mz',
      pacienteTelefone: '+258840000000',
      preferenciaPaciente: 'EMAIL',
      medicoId: 'medico-1',
      medicoNome: 'Dr. Ricardo Mabote',
      medicoEmail: 'ricardo@exemplo.co.mz',
      medicoTelefone: '+258840000001',
      especialidade: 'Cardiologia',
      inicio: new Date('2026-11-13T09:00:00.000Z'),
      fim: new Date('2026-11-13T10:00:00.000Z'),
      estado: 'PENDENTE',
    },
  };
}

describe('EventBus', () => {
  it('distribui o evento e guarda o resultado de cada consumidor', async () => {
    const bus = new EventBus();
    const recebidos: string[] = [];

    const notificacao: IObservador = {
      nome: 'NotificacaoHandler',
      async aoOcorrer() {
        recebidos.push('notificacao');
      },
    };
    const auditoria: IObservador = {
      nome: 'AuditoriaHandler',
      async aoOcorrer() {
        recebidos.push('auditoria');
      },
    };

    bus.inscrever('*', notificacao);
    bus.inscrever('*', auditoria);

    await bus.publicar(eventoDeTeste());

    expect(recebidos.sort()).toEqual(['auditoria', 'notificacao']);
    expect(bus.historico()).toHaveLength(1);
    expect(bus.historico()[0]).toMatchObject({
      tipo: TiposEvento.CONSULTA_CRIADA,
      consumidores: [
        { nome: 'NotificacaoHandler', estado: 'ok' },
        { nome: 'AuditoriaHandler', estado: 'ok' },
      ],
    });
    expect(bus.historico()[0]?.resumo).toContain('Ana');
  });

  it('continua a processar os restantes consumidores quando um falha', async () => {
    const bus = new EventBus();
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    bus.inscrever('*', {
      nome: 'ConsumidorInstavel',
      async aoOcorrer() {
        throw new Error('falha simulada');
      },
    });
    bus.inscrever('*', {
      nome: 'AuditoriaHandler',
      async aoOcorrer() {
        /* concluído */
      },
    });

    await bus.publicar(eventoDeTeste());

    const registo = bus.historico()[0];
    expect(registo?.consumidores).toEqual([
      { nome: 'ConsumidorInstavel', estado: 'falhou' },
      { nome: 'AuditoriaHandler', estado: 'ok' },
    ]);
    expect(erro).toHaveBeenCalled();

    erro.mockRestore();
  });

  it('mantém apenas os eventos mais recentes no histórico', async () => {
    const bus = new EventBus();

    for (let indice = 0; indice < 105; indice += 1) {
      await bus.publicar({
        ...eventoDeTeste(),
        ocorridoEm: new Date(2026, 10, 12, 9, indice),
      });
    }

    expect(bus.historico(200)).toHaveLength(100);
    expect(bus.historico(1)[0]?.id).toBe(105);

    bus.limparHistorico();
    expect(bus.historico()).toHaveLength(0);
  });
});
