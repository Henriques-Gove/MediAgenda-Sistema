import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracaoSistema } from '../src/config/ConfiguracaoSistema';
import { CadeiaValidacaoMarcacao } from '../src/domain/chain/CadeiaValidacaoMarcacao';
import type {
  MedicoAgendaInfo,
  PedidoMarcacao,
  PortaAgenda,
} from '../src/domain/chain/PedidoMarcacao';

/** Porta em memoria: permite testar a cadeia sem Prisma. */
class PortaFake implements PortaAgenda {
  conflito = false;
  totalDia = 0;
  totalPaciente = 0;

  existeConflito = vi.fn(async () => this.conflito);
  contarConsultasNoDia = vi.fn(async () => this.totalDia);
  contarConsultasFuturasPacienteMedico = vi.fn(async () => this.totalPaciente);
}

function criarConfig(): ConfiguracaoSistema {
  const valores: Record<string, number> = {
    antecedencia_minima_horas: 1,
    max_consultas_paciente_medico: 3,
  };

  return {
    horarioFuncionamento: () => ({
      abertura: '08:00',
      fecho: '20:00',
      dias: [1, 2, 3, 4, 5],
    }),
    obterNumero: (chave: string) => valores[chave] ?? 0,
  } as unknown as ConfiguracaoSistema;
}

function criarMedico(overrides: Partial<MedicoAgendaInfo> = {}): MedicoAgendaInfo {
  return {
    id: 'medico-1',
    nome: 'Dr. Teste',
    ativo: true,
    maxConsultasDia: 10,
    duracaoConsultaMinutos: 60,
    disponibilidades: [{ diaSemana: 1, horaInicio: '08:00', horaFim: '18:00' }],
    bloqueios: [],
    ...overrides,
  };
}

/** 09/11/2026 e uma segunda-feira. */
function criarPedido(overrides: Partial<PedidoMarcacao> = {}): PedidoMarcacao {
  return {
    pacienteId: 'paciente-1',
    medico: criarMedico(),
    inicio: new Date(2026, 10, 9, 10, 0, 0),
    fim: new Date(2026, 10, 9, 11, 0, 0),
    agora: new Date(2026, 10, 9, 8, 0, 0),
    ...overrides,
  };
}

function criarCadeia(porta: PortaFake): CadeiaValidacaoMarcacao {
  return new CadeiaValidacaoMarcacao(porta, criarConfig());
}

describe('Chain of Responsibility - validacao de marcacao', () => {
  it('aceita um pedido valido', async () => {
    const porta = new PortaFake();
    await expect(criarCadeia(porta).validar(criarPedido())).resolves.toEqual({ valido: true });
  });

  it('rejeita marcacoes com menos de 1 hora de antecedencia (RN-01)', async () => {
    const porta = new PortaFake();
    const resultado = await criarCadeia(porta).validar(
      criarPedido({ agora: new Date(2026, 10, 9, 9, 30, 0) }),
    );

    expect(resultado.valido).toBe(false);
    expect(resultado.regra).toBe('RN-01');
  });

  it('rejeita marcacoes fora dos dias de funcionamento (RN-09)', async () => {
    const porta = new PortaFake();
    const resultado = await criarCadeia(porta).validar(
      criarPedido({
        inicio: new Date(2026, 10, 8, 10, 0, 0),
        fim: new Date(2026, 10, 8, 11, 0, 0),
        agora: new Date(2026, 10, 8, 8, 0, 0),
        medico: criarMedico({
          disponibilidades: [{ diaSemana: 0, horaInicio: '08:00', horaFim: '18:00' }],
        }),
      }),
    );

    expect(resultado.valido).toBe(false);
    expect(resultado.regra).toBe('RN-09');
  });

  it('rejeita marcacoes fora do horario de funcionamento (RN-09)', async () => {
    const porta = new PortaFake();
    const resultado = await criarCadeia(porta).validar(
      criarPedido({
        inicio: new Date(2026, 10, 9, 21, 0, 0),
        fim: new Date(2026, 10, 9, 22, 0, 0),
        agora: new Date(2026, 10, 9, 19, 0, 0),
        medico: criarMedico({
          disponibilidades: [{ diaSemana: 1, horaInicio: '08:00', horaFim: '23:00' }],
        }),
      }),
    );

    expect(resultado.valido).toBe(false);
    expect(resultado.regra).toBe('RN-09');
  });

  it('rejeita medicos inactivos (RF-04)', async () => {
    const porta = new PortaFake();
    const resultado = await criarCadeia(porta).validar(
      criarPedido({ medico: criarMedico({ ativo: false }) }),
    );

    expect(resultado.valido).toBe(false);
    expect(resultado.regra).toBe('RF-04');
  });

  it('rejeita horarios sem disponibilidade do medico (RF-04)', async () => {
    const porta = new PortaFake();
    const resultado = await criarCadeia(porta).validar(
      criarPedido({ medico: criarMedico({ disponibilidades: [] }) }),
    );

    expect(resultado.valido).toBe(false);
    expect(resultado.regra).toBe('RF-04');
  });

  it('rejeita horarios abrangidos por um bloqueio (RF-04)', async () => {
    const porta = new PortaFake();
    const resultado = await criarCadeia(porta).validar(
      criarPedido({
        medico: criarMedico({
          bloqueios: [
            {
              inicio: new Date(2026, 10, 9, 9, 30, 0),
              fim: new Date(2026, 10, 9, 10, 30, 0),
              motivo: 'Formacao',
            },
          ],
        }),
      }),
    );

    expect(resultado.valido).toBe(false);
    expect(resultado.regra).toBe('RF-04');
  });

  it('rejeita conflitos de agenda do medico (RN-05)', async () => {
    const porta = new PortaFake();
    porta.conflito = true;
    const resultado = await criarCadeia(porta).validar(criarPedido());

    expect(resultado.valido).toBe(false);
    expect(resultado.regra).toBe('RN-05');
  });

  it('rejeita quando o limite diario do medico foi atingido (RN-03)', async () => {
    const porta = new PortaFake();
    porta.totalDia = 10;
    const resultado = await criarCadeia(porta).validar(criarPedido());

    expect(resultado.valido).toBe(false);
    expect(resultado.regra).toBe('RN-03');
  });

  it('rejeita quando o paciente ja tem 3 consultas futuras com o medico (RN-06)', async () => {
    const porta = new PortaFake();
    porta.totalPaciente = 3;
    const resultado = await criarCadeia(porta).validar(criarPedido());

    expect(resultado.valido).toBe(false);
    expect(resultado.regra).toBe('RN-06');
  });

  it('para a cadeia no primeiro elo que falha', async () => {
    const porta = new PortaFake();
    await criarCadeia(porta).validar(criarPedido({ agora: new Date(2026, 10, 9, 9, 30, 0) }));

    expect(porta.existeConflito).not.toHaveBeenCalled();
    expect(porta.contarConsultasNoDia).not.toHaveBeenCalled();
    expect(porta.contarConsultasFuturasPacienteMedico).not.toHaveBeenCalled();
  });
});
