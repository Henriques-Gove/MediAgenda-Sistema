import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanalNotificacao } from '../src/domain/enums';
import { NotificacaoFactory } from '../src/patterns/factory/NotificacaoFactory';
import { SeletorDuracaoConsulta } from '../src/patterns/strategy/DuracaoConsultaStrategy';

describe('Strategy - duracao da consulta (RN-04)', () => {
  const seletor = new SeletorDuracaoConsulta();

  it('usa a duracao configurada no medico quando nao ha especialidade', () => {
    expect(seletor.calcular({ duracaoConsultaMinutos: 90 })).toBe(90);
  });

  it('da prioridade a duracao da especialidade', () => {
    expect(
      seletor.calcular({ duracaoConsultaMinutos: 90 }, { duracaoPadraoMinutos: 75 }),
    ).toBe(75);
  });

  it('limita a duracao ao intervalo de 60 a 120 minutos', () => {
    expect(seletor.calcular({ duracaoConsultaMinutos: 30 })).toBe(60);
    expect(seletor.calcular({ duracaoConsultaMinutos: 180 })).toBe(120);
  });
});

describe('Factory - criacao de estrategias de notificacao', () => {
  const enviarEmail = vi.fn(async () => ({ sucesso: true, simulado: true }));
  const enviarSMS = vi.fn(async () => ({ sucesso: true, simulado: true }));
  const factory = new NotificacaoFactory({ enviarEmail }, { enviarSMS });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria a estrategia de e-mail e delega no adaptador', async () => {
    const estrategia = factory.criar(CanalNotificacao.EMAIL);
    expect(estrategia.canal).toBe(CanalNotificacao.EMAIL);

    await estrategia.enviar({
      destino: 'paciente@exemplo.co.mz',
      assunto: 'Consulta confirmada',
      corpo: 'A sua consulta foi confirmada.',
    });

    expect(enviarEmail).toHaveBeenCalledWith(
      'paciente@exemplo.co.mz',
      'Consulta confirmada',
      'A sua consulta foi confirmada.',
    );
  });

  it('cria a estrategia de SMS e junta assunto e corpo', async () => {
    const estrategia = factory.criar(CanalNotificacao.SMS);
    expect(estrategia.canal).toBe(CanalNotificacao.SMS);

    await estrategia.enviar({
      destino: '+258840000000',
      assunto: 'Consulta confirmada',
      corpo: 'A sua consulta foi confirmada.',
    });

    expect(enviarSMS).toHaveBeenCalledWith(
      '+258840000000',
      'Consulta confirmada\nA sua consulta foi confirmada.',
    );
  });

  it('usa e-mail como estrategia por omissao para canais desconhecidos', () => {
    expect(factory.criar('WHATSAPP').canal).toBe(CanalNotificacao.EMAIL);
  });
});
