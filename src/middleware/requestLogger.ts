import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';

/**
 * Atribui um identificador a cada pedido, devolve-o no cabeçalho
 * `X-Request-Id` e registra método, rota, estado e duração. O corpo e os
 * dados clínicos nunca são registados.
 */
export function registarPedidos(req: Request, res: Response, next: NextFunction): void {
  const inicio = process.hrtime.bigint();
  const idExistente = req.get('x-request-id');
  const requestId = idExistente && /^[a-zA-Z0-9-]{8,80}$/.test(idExistente) ? idExistente : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duracaoMs = Number(process.hrtime.bigint() - inicio) / 1_000_000;
    const nivel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[nivel]('pedido concluído', {
      requestId,
      metodo: req.method,
      rota: req.originalUrl.split('?')[0],
      estado: res.statusCode,
      duracaoMs: Math.round(duracaoMs * 10) / 10,
      utilizadorId: req.session?.utilizador?.id,
    });
  });

  next();
}
