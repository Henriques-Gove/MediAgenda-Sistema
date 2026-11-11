import { describe, expect, it } from 'vitest';
import { EstadoConsulta } from '../src/domain/enums';
import type { DadosEstadoConsulta } from '../src/domain/state/EstadoConsultaBase';
import { EstadoFactory } from '../src/domain/state/EstadoFactory';

function dados(overrides: Partial<DadosEstadoConsulta> = {}): DadosEstadoConsulta {
  return {
    id: 'consulta-teste',
    inicio: new Date(Date.now() + 48 * 60 * 60 * 1000),
    criadaEm: new Date(),
    agora: new Date(),
    ...overrides,
  };
}

describe('State - transicoes da consulta', () => {
  it('confirma uma consulta pendente dentro do prazo (RN-07)', () => {
    const estado = EstadoFactory.criar(EstadoConsulta.PENDENTE);
    const resultado = estado.confirmar(
      dados({ expiraConfirmacaoEm: new Date(Date.now() + 60 * 60 * 1000) }),
    );

    expect(resultado.permitido).toBe(true);
    expect(resultado.novoEstado).toBe(EstadoConsulta.CONFIRMADA);
  });

  it('recusa confirmar uma consulta pendente cujo prazo expirou (RN-07)', () => {
    const estado = EstadoFactory.criar(EstadoConsulta.PENDENTE);
    const resultado = estado.confirmar(
      dados({ expiraConfirmacaoEm: new Date(Date.now() - 60 * 1000) }),
    );

    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toContain('expirou');
  });

  it('permite cancelamento gratuito com 24h ou mais de antecedencia (RN-02)', () => {
    const estado = EstadoFactory.criar(EstadoConsulta.CONFIRMADA);
    const resultado = estado.cancelar(dados());

    expect(resultado.permitido).toBe(true);
    expect(resultado.novoEstado).toBe(EstadoConsulta.CANCELADA);
    expect(resultado.cancelamentoTardio).toBeFalsy();
  });

  it('marca como tardio um cancelamento com menos de 24h (RN-02)', () => {
    const estado = EstadoFactory.criar(EstadoConsulta.CONFIRMADA);
    const resultado = estado.cancelar(
      dados({ inicio: new Date(Date.now() + 2 * 60 * 60 * 1000) }),
    );

    expect(resultado.permitido).toBe(true);
    expect(resultado.novoEstado).toBe(EstadoConsulta.CANCELADA);
    expect(resultado.cancelamentoTardio).toBe(true);
    expect(resultado.aviso).toContain('tardio');
  });

  it('so permite realizar uma consulta confirmada depois do inicio', () => {
    const estado = EstadoFactory.criar(EstadoConsulta.CONFIRMADA);

    expect(estado.realizar(dados({ inicio: new Date(Date.now() + 60 * 60 * 1000) })).permitido).toBe(
      false,
    );
    expect(estado.realizar(dados({ inicio: new Date(Date.now() - 60 * 1000) })).permitido).toBe(
      true,
    );
  });

  it('marca consultas realizadas e canceladas como estados finais', () => {
    const realizada = EstadoFactory.criar(EstadoConsulta.REALIZADA);
    const cancelada = EstadoFactory.criar(EstadoConsulta.CANCELADA);

    expect(realizada.permiteAvaliacao).toBe(true);
    expect(realizada.eFinal).toBe(true);
    expect(cancelada.eFinal).toBe(true);
    expect(cancelada.confirmar(dados()).permitido).toBe(false);
  });

  it('faz fallback para cancelada quando o estado persistido e desconhecido', () => {
    expect(EstadoFactory.criar('ESTADO_INEXISTENTE').nome).toBe(EstadoConsulta.CANCELADA);
  });
});
