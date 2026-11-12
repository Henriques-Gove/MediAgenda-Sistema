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

export interface ConsumidorEvento {
  nome: string;
  estado: 'ok' | 'falhou';
}

/**
 * Registo de um evento ja distribuido. Serve o painel "Sistema em direto",
 * onde o administrador consegue ver a arquitectura a funcionar sem consultar
 * a base de dados nem os ficheiros de log.
 */
export interface RegistoEvento {
  id: number;
  tipo: TipoEvento;
  ocorridoEm: Date;
  processadoEm: Date;
  duracaoMs: number;
  consumidores: ConsumidorEvento[];
  resumo: string | null;
}

type ChaveEvento = TipoEvento | '*';

const LIMITE_HISTORICO = 100;

const ROTULOS_PERFIL: Record<string, string> = {
  PACIENTE: 'Paciente',
  MEDICO: 'Médico',
  SECRETARIO: 'Secretaria',
  ADMINISTRADOR: 'Administrador',
};

function primeiroNome(nome: string | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? '';
}

function resumirEvento(evento: EventoDominio): string | null {
  if (evento.consulta) {
    const paciente = primeiroNome(evento.consulta.pacienteNome);
    const medico = evento.consulta.medicoNome;
    const especialidade = evento.consulta.especialidade;
    const partes = [paciente, medico, especialidade].filter(Boolean);
    return partes.join(' · ');
  }

  if (evento.utilizador) {
    const perfil = ROTULOS_PERFIL[evento.utilizador.perfil] ?? evento.utilizador.perfil;
    return `${evento.utilizador.nome} · ${perfil}`;
  }

  return null;
}

/**
 * Event Bus (EDA + Observer). O produtor publica um evento e nao conhece os
 * consumidores. Cada consumidor reage de forma independente; a falha de um nao
 * impede os restantes de processar o mesmo evento.
 */
export class EventBus {
  private static instancia: EventBus | null = null;
  private readonly observadores = new Map<ChaveEvento, IObservador[]>();
  private readonly historicoEventos: RegistoEvento[] = [];
  private sequencia = 0;

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

  /** Eventos mais recentes primeiro. */
  historico(limite = 25): RegistoEvento[] {
    return this.historicoEventos.slice(0, Math.max(0, limite));
  }

  limparHistorico(): void {
    this.historicoEventos.length = 0;
  }

  async publicar(evento: EventoDominio): Promise<void> {
    const inicio = Date.now();
    const interessados = [
      ...(this.observadores.get(evento.tipo) ?? []),
      ...(this.observadores.get('*') ?? []),
    ];

    const resultados = await Promise.allSettled(
      interessados.map((observador) => observador.aoOcorrer(evento)),
    );

    const consumidores: ConsumidorEvento[] = resultados.map((resultado, indice) => ({
      nome: interessados[indice]?.nome ?? 'Consumidor desconhecido',
      estado: resultado.status === 'fulfilled' ? 'ok' : 'falhou',
    }));

    resultados.forEach((resultado, indice) => {
      if (resultado.status === 'rejected') {
        const observador = interessados[indice];
        console.error(
          `[EventBus] O observador "${observador?.nome}" falhou ao processar ${evento.tipo}:`,
          resultado.reason,
        );
      }
    });

    this.sequencia += 1;
    this.historicoEventos.unshift({
      id: this.sequencia,
      tipo: evento.tipo,
      ocorridoEm: evento.ocorridoEm,
      processadoEm: new Date(),
      duracaoMs: Date.now() - inicio,
      consumidores,
      resumo: resumirEvento(evento),
    });

    if (this.historicoEventos.length > LIMITE_HISTORICO) {
      this.historicoEventos.length = LIMITE_HISTORICO;
    }
  }
}

export const eventBus = EventBus.getInstance();
