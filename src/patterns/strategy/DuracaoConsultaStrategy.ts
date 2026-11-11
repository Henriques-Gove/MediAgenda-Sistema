export interface MedicoDuracaoInfo {
  duracaoConsultaMinutos: number;
}

export interface EspecialidadeDuracaoInfo {
  duracaoPadraoMinutos: number;
}

/**
 * Strategy (RN-04): a duracao da consulta pode ser calculada de formas
 * diferentes. A escolha e feita em tempo de execucao, sem `if/else` gigantes.
 */
export interface IEstrategiaDuracaoConsulta {
  calcular(medico: MedicoDuracaoInfo, especialidade?: EspecialidadeDuracaoInfo | null): number;
}

export class EstrategiaDuracaoPorEspecialidade implements IEstrategiaDuracaoConsulta {
  calcular(_medico: MedicoDuracaoInfo, especialidade?: EspecialidadeDuracaoInfo | null): number {
    return especialidade?.duracaoPadraoMinutos ?? 60;
  }
}

export class EstrategiaDuracaoDoMedico implements IEstrategiaDuracaoConsulta {
  calcular(medico: MedicoDuracaoInfo): number {
    return medico.duracaoConsultaMinutos;
  }
}

/** Selecciona a estrategia adequada: especialidade tem prioridade. */
export class SeletorDuracaoConsulta {
  constructor(
    private readonly porEspecialidade = new EstrategiaDuracaoPorEspecialidade(),
    private readonly doMedico = new EstrategiaDuracaoDoMedico(),
  ) {}

  calcular(
    medico: MedicoDuracaoInfo,
    especialidade?: EspecialidadeDuracaoInfo | null,
  ): number {
    const estrategia = especialidade ? this.porEspecialidade : this.doMedico;
    const minutos = estrategia.calcular(medico, especialidade);
    // RN-04: a duracao fica sempre entre 1 e 2 horas.
    return Math.min(120, Math.max(60, minutos));
  }
}
