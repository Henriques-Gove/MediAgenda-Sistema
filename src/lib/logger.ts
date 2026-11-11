import { env } from '../config/env';

type Nivel = 'debug' | 'info' | 'warn' | 'error';

const prioridades: Record<Nivel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function nivelAtivo(): Nivel {
  return env.logLevel in prioridades ? (env.logLevel as Nivel) : 'info';
}

function emitir(nivel: Nivel, mensagem: string, dados?: Record<string, unknown>): void {
  if (prioridades[nivel] < prioridades[nivelAtivo()]) return;

  const registo = {
    timestamp: new Date().toISOString(),
    nivel,
    mensagem,
    ambiente: env.nodeEnv,
    ...dados,
  };

  const linha = JSON.stringify(registo);
  if (nivel === 'error') {
    console.error(linha);
  } else if (nivel === 'warn') {
    console.warn(linha);
  } else {
    console.log(linha);
  }
}

/**
 * Registo estruturado (uma linha JSON por evento), compatível com agregadores
 * de logs como Loki, CloudWatch, Datadog ou Papertrail. Nunca registar
 * palavras-passe, tokens, códigos 2FA ou dados clínicos.
 */
export const logger = {
  debug: (mensagem: string, dados?: Record<string, unknown>) => emitir('debug', mensagem, dados),
  info: (mensagem: string, dados?: Record<string, unknown>) => emitir('info', mensagem, dados),
  warn: (mensagem: string, dados?: Record<string, unknown>) => emitir('warn', mensagem, dados),
  error: (mensagem: string, dados?: Record<string, unknown>) => emitir('error', mensagem, dados),
};
