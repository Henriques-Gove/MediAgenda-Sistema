import type { TipoEvento } from '../domain/enums';
import type { EventoDominio } from './eventos';

export interface IObservador {
  readonly nome: string;
  aoOcorrer(evento: EventoDominio): Promise<void>;
}

/** Porta usada pelos servicos para publicar eventos (DIP). */
export interface IPublicadorEventos {
  publicar(evento: EventoDominio): Promise<void>;
}

type ChaveEvento = TipoEvento | '*';

/**
 * Event Bus (EDA + Observer). O produtor publica um evento e nao conhece os
 * consumidores. Cada consumidor reage de forma independente; a falha de um nao
 * impede os restantes de processar o mesmo evento.
 */
export class EventBus {
  private static instancia: EventBus | null = null;
  private readonly observadores = new Map<ChaveEvento, IObservador[]>();

  static getInstance(): EventBus {
    if (!EventBus.instancia) EventBus.instancia = new EventBus();
    return EventBus.instancia;
  }

  /** Usado nos testes para obter um bus limpo. */
  static reiniciar(): void {
    EventBus.instancia = null;
  }

  inscrever(tipo: ChaveEvento, observador: IObservador): void {
    const lista = this.observadores.get(tipo) ?? [];
    lista.push(observador);
    this.observadores.set(tipo, lista);
  }

  observadoresDe(tipo: ChaveEvento): IObservador[] {
    return [...(this.observadores.get(tipo) ?? [])];
  }

  async publicar(evento: EventoDominio): Promise<void> {
    const interessados = [
      ...(this.observadores.get(evento.tipo) ?? []),
      ...(this.observadores.get('*') ?? []),
    ];

    const resultados = await Promise.allSettled(
      interessados.map((observador) => observador.aoOcorrer(evento)),
    );

    resultados.forEach((resultado, indice) => {
      if (resultado.status === 'rejected') {
        const observador = interessados[indice];
        console.error(
          `[EventBus] O observador "${observador?.nome}" falhou ao processar ${evento.tipo}:`,
          resultado.reason,
        );
      }
    });
  }
}

export const eventBus = EventBus.getInstance();
