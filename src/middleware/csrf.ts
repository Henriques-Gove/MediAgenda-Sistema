import crypto from 'node:crypto';
import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

function compararSeguro(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function tokenEnviado(req: Request): string {
  return (
    (typeof req.body?._csrf === 'string' && req.body._csrf) ||
    (typeof req.get('x-csrf-token') === 'string' && req.get('x-csrf-token')) ||
    (typeof req.query._csrf === 'string' && req.query._csrf) ||
    ''
  );
}

function tokenValido(req: Request, enviado: string): boolean {
  return Boolean(enviado) && compararSeguro(req.session.csrfToken ?? '', enviado);
}

function recusar(req: Request, res: Response): void {
  req.session.flash = {
    tipo: 'danger',
    mensagem: 'A sessão expirou ou o formulário é inválido. Tente novamente.',
  };
  res.redirect(req.get('referer') ?? '/');
}

/**
 * Proteção CSRF com o padrão synchronizer token.
 * O token fica guardado na sessão e é enviado em todos os formulários POST
 * através de res.locals.csrfToken.
 *
 * Em pedidos multipart o corpo ainda não foi lido neste ponto (é o multer que
 * o lê na rota). Nesses casos a validação é feita por `csrfDepoisDoUpload`.
 */
export function csrf(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (METODOS_SEGUROS.has(req.method) || env.isTest) {
    next();
    return;
  }

  // A API é apenas de leitura e usa autenticação própria por sessão/API.
  if (req.path.startsWith('/api')) {
    next();
    return;
  }

  if (req.is('multipart/form-data')) {
    next();
    return;
  }

  if (!tokenValido(req, tokenEnviado(req))) {
    if (req.path.startsWith('/api')) {
      res.status(403).json({ erro: 'Token CSRF inválido ou ausente.' });
      return;
    }
    recusar(req, res);
    return;
  }

  next();
}

/**
 * Valida o token CSRF de um formulário multipart depois de o multer ter lido
 * os campos. Se o token falhar, remove os ficheiros já gravados no disco.
 */
export function csrfDepoisDoUpload(req: Request, res: Response, next: NextFunction): void {
  if (env.isTest || tokenValido(req, tokenEnviado(req))) {
    next();
    return;
  }

  const ficheiros: Array<{ path: string }> = [];
  if (req.file) ficheiros.push(req.file);
  if (Array.isArray(req.files)) {
    ficheiros.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    for (const lista of Object.values(req.files)) {
      if (Array.isArray(lista)) ficheiros.push(...lista);
    }
  }
  for (const ficheiro of ficheiros) {
    fs.rm(ficheiro.path, { force: true }, () => undefined);
  }

  recusar(req, res);
}
