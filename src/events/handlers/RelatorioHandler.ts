import type { EventoDominio } from '../eventos';
import type { IObservador } from '../EventBus';

interface Contadores {
  total: number;
  porTipo: Record<string, number>;
  ultimos: Array<{ tipo: string; em: Date; consultaId?: string }>;
}

/**
 * Consumidor independente que alimenta o painel de estatisticas (RF-13).
 * Mantem contadores em memoria para mostrar actividade em tempo real,
 * enquanto os relatorios historicos sao calculados a partir da base de dados.
 */
export class RelatorioHandler implements IObservador {
  readonly nome = 'RelatorioHandler';
  private contadores: Contadores = { total: 0, porTipo: {}, ultimos: [] };

  async aoOcorrer(evento: EventoDominio): Promise<void> {
    this.contadores.total += 1;
    this.contadores.porTipo[evento.tipo] = (this.contadores.porTipo[evento.tipo] ?? 0) + 1;
    this.contadores.ultimos.unshift({
      tipo: evento.tipo,
      em: evento.ocorridoEm,
      consultaId: evento.consulta?.consultaId,
    });
    this.contadores.ultimos = this.contadores.ultimos.slice(0, 20);
  }

  snapshot(): Contadores {
    return {
      total: this.contadores.total,
      porTipo: { ...this.contadores.porTipo },
      ultimos: [...this.contadores.ultimos],
    };
  }

  reiniciar(): void {
    this.contadores = { total: 0, porTipo: {}, ultimos: [] };
  }
}
