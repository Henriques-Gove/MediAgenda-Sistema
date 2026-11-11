import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracaoSistema } from '../src/config/ConfiguracaoSistema';
import type { PortaAgenda } from '../src/domain/chain/PedidoMarcacao';
import { ErroValidacao, ValidacaoMarcacaoError } from '../src/domain/errors';
import { formatarDataInput } from '../src/lib/date';
import { AgendamentoFacade } from '../src/patterns/facade/AgendamentoFacade';
import type { ConsultaService } from '../src/services/ConsultaService';
import type { MedicoService } from '../src/services/MedicoService';
import type { PacienteService } from '../src/services/PacienteService';

function proximaSegunda(): Date {
  const data = new Date();
  data.setHours(10, 0, 0, 0);
  do {
    data.setDate(data.getDate() + 1);
  } while (data.getDay() !== 1);
  return data;
}

function criarCenario() {
  const criar = vi.fn(async (dados: Record<string, unknown>) => ({
    id: 'consulta-1',
    ...dados,
  }));
  const conflito = vi.fn(async () => false);
  const porta: PortaAgenda = {
    existeConflito: conflito,
    contarConsultasNoDia: vi.fn(async () => 0),
    contarConsultasFuturasPacienteMedico: vi.fn(async () => 0),
  };

  const especialidade = { id: 'esp-1', nome: 'Cardiologia', duracaoPadraoMinutos: 60 };
  const medico = {
    id: 'med-1',
    utilizador: { nome: 'Dr. Teste', ativo: true },
    ativo: true,
    maxConsultasDia: 10,
    duracaoConsultaMinutos: 60,
    disponibilidades: [{ diaSemana: 1, horaInicio: '08:00', horaFim: '18:00' }],
    bloqueios: [],
    especialidades: [{ especialidadeId: 'esp-1', especialidade }],
  };

  const consultas = { criar } as unknown as ConsultaService;
  const medicos = {
    obterPorId: vi.fn(async () => medico),
  } as unknown as MedicoService;
  const pacientes = {
    obterPorId: vi.fn(async () => ({ id: 'pac-1' })),
  } as unknown as PacienteService;

  const config = {
    horarioFuncionamento: () => ({
      abertura: '08:00',
      fecho: '20:00',
      dias: [1, 2, 3, 4, 5],
    }),
    obterNumero: (chave: string) =>
      chave === 'antecedencia_minima_horas'
        ? 1
        : chave === 'max_consultas_paciente_medico'
          ? 3
          : 0,
  } as unknown as ConfiguracaoSistema;

  const facade = new AgendamentoFacade(consultas, medicos, pacientes, porta, config);

  return { facade, criar, conflito };
}

function pedido(data: string, especialidadeId = 'esp-1') {
  return {
    pacienteId: 'pac-1',
    medicoId: 'med-1',
    especialidadeId,
    data,
    hora: '10:00',
    motivo: 'Dor de cabeca',
    atorId: 'utilizador-1',
    atorPerfil: 'PACIENTE',
  };
}

describe('Facade - marcacao de consultas', () => {
  it('orquestra validacao, duracao e persistencia', async () => {
    const { facade, criar } = criarCenario();
    const data = formatarDataInput(proximaSegunda());

    const resultado = await facade.marcar(pedido(data));

    expect(resultado).toMatchObject({ id: 'consulta-1' });
    expect(criar).toHaveBeenCalledTimes(1);

    const dados = criar.mock.calls[0]![0] as {
      pacienteId: string;
      medicoId: string;
      especialidadeId: string;
      inicio: Date;
      fim: Date;
      motivo: string;
      atorId: string;
      atorPerfil: string;
    };

    expect(dados.pacienteId).toBe('pac-1');
    expect(dados.medicoId).toBe('med-1');
    expect(dados.especialidadeId).toBe('esp-1');
    expect(dados.inicio.getHours()).toBe(10);
    expect(dados.fim.getHours()).toBe(11);
    expect(dados.motivo).toBe('Dor de cabeca');
    expect(dados.atorId).toBe('utilizador-1');
    expect(dados.atorPerfil).toBe('PACIENTE');
  });

  it('interrompe a marcacao quando a cadeia detecta conflito (RN-05)', async () => {
    const { facade, criar, conflito } = criarCenario();
    conflito.mockResolvedValueOnce(true);
    const data = formatarDataInput(proximaSegunda());

    await expect(facade.marcar(pedido(data))).rejects.toBeInstanceOf(ValidacaoMarcacaoError);
    expect(criar).not.toHaveBeenCalled();
  });

  it('recusa especialidades que o medico nao atende', async () => {
    const { facade, criar } = criarCenario();
    const data = formatarDataInput(proximaSegunda());

    await expect(facade.marcar(pedido(data, 'esp-2'))).rejects.toBeInstanceOf(ErroValidacao);
    expect(criar).not.toHaveBeenCalled();
  });
});
