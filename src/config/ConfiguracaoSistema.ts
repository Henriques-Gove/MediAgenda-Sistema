import type { PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { horaParaMinutos } from '../lib/date';

/**
 * Singleton (padrao de projeto): existe uma unica instancia de configuracao
 * partilhada por todo o sistema. Se o Administrador alterar o horario de
 * funcionamento, a alteracao fica imediatamente visivel para todos os servicos.
 */
export const CONFIGURACOES_PADRAO: Record<string, string> = {
  horario_abertura: '08:00',
  horario_fecho: '20:00',
  dias_funcionamento: '1,2,3,4,5',
  antecedencia_minima_horas: '1',
  limite_cancelamento_horas: '24',
  max_consultas_paciente_medico: '3',
  expiracao_confirmacao_horas: '2',
  duracao_padrao_minutos: '60',
  nome_clinica: 'MediAgenda - Clinica Central',
};

export class ConfiguracaoSistema {
  private static instancia: ConfiguracaoSistema | null = null;
  private valores = new Map<string, string>();
  private carregada = false;

  private constructor(private readonly db: PrismaClient) {}

  static getInstance(db?: PrismaClient): ConfiguracaoSistema {
    if (!ConfiguracaoSistema.instancia) {
      ConfiguracaoSistema.instancia = new ConfiguracaoSistema(db ?? prismaPadrao);
    }
    return ConfiguracaoSistema.instancia;
  }

  /** Usado apenas nos testes para garantir isolamento entre cenarios. */
  static reiniciar(): void {
    ConfiguracaoSistema.instancia = null;
  }

  async carregar(): Promise<void> {
    const registos = await this.db.configuracao.findMany();
    this.valores.clear();
    for (const registo of registos) {
      this.valores.set(registo.chave, registo.valor);
    }
    this.carregada = true;
  }

  async garantirCarregada(): Promise<void> {
    if (!this.carregada) await this.carregar();
  }

  obter(chave: string): string {
    return this.valores.get(chave) ?? CONFIGURACOES_PADRAO[chave] ?? '';
  }

  obterNumero(chave: string): number {
    return Number(this.obter(chave));
  }

  obterDiasFuncionamento(): number[] {
    return this.obter('dias_funcionamento')
      .split(',')
      .map((dia) => Number(dia.trim()))
      .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6);
  }

  horarioFuncionamento(): { abertura: string; fecho: string; dias: number[] } {
    return {
      abertura: this.obter('horario_abertura'),
      fecho: this.obter('horario_fecho'),
      dias: this.obterDiasFuncionamento(),
    };
  }

  estaDentroDoHorarioFuncionamento(data: Date): boolean {
    const { abertura, fecho, dias } = this.horarioFuncionamento();
    if (!dias.includes(data.getDay())) return false;
    const minutos = data.getHours() * 60 + data.getMinutes();
    return minutos >= horaParaMinutos(abertura) && minutos < horaParaMinutos(fecho);
  }

  async definir(chave: string, valor: string, descricao?: string): Promise<void> {
    await this.db.configuracao.upsert({
      where: { chave },
      create: { chave, valor, descricao },
      update: { valor, descricao },
    });
    this.valores.set(chave, valor);
  }

  todos(): Record<string, string> {
    return { ...CONFIGURACOES_PADRAO, ...Object.fromEntries(this.valores) };
  }
}
