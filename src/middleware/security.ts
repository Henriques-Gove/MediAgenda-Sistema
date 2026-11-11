import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from '../config/env';

/** Cabeçalhos HTTP de segurança, incluindo uma CSP com nonce para scripts inline. */
export function segurancaHttp() {
  return [
    (req: Request, res: Response, next: NextFunction) => {
      res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
      next();
    },
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            (_req: IncomingMessage, res: ServerResponse) => {
              const nonce = (res as ServerResponse & { locals?: { cspNonce?: string } }).locals?.cspNonce;
              return `'nonce-${nonce ?? ''}'`;
            },
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: env.nodeEnv === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts:
        env.nodeEnv === 'production'
          ? { maxAge: 15552000, includeSubDomains: true }
          : false,
    }),
  ];
}

function responderLimite(mensagem: string) {
  return (req: Request, res: Response): void => {
    if (req.path.startsWith('/api')) {
      res.status(429).json({ erro: mensagem });
      return;
    }
    req.session.flash = { tipo: 'warning', mensagem };
    const destino = req.get('referer') ?? '/';
    res.redirect(destino);
  };
}

export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: responderLimite(
    'Demasiadas tentativas de início de sessão. Aguarde alguns minutos e tente novamente.',
  ),
});

export const limiteRecuperacao = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: responderLimite(
    'Demasiados pedidos de recuperação. Aguarde uma hora antes de tentar novamente.',
  ),
});

export const limiteRegisto = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: responderLimite('Demasiados registos a partir deste endereço. Tente mais tarde.'),
});

export const limiteApi = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ erro: 'Limite de pedidos excedido. Tente novamente dentro de um minuto.' });
  },
});
