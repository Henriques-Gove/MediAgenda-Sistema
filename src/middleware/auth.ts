import type { NextFunction, Request, Response } from 'express';
import { ErroNaoAutenticado, ErroNaoAutorizado } from '../domain/errors';
import { passwordExpirada } from '../lib/password';

export function carregarUtilizador(req: Request, res: Response, next: NextFunction): void {
  res.locals.utilizador = req.session.utilizador ?? null;
  next();
}

export function exigirAutenticacao(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.utilizador) {
    req.session.flash = {
      tipo: 'warning',
      mensagem: 'Precisa de iniciar sessão para aceder a essa área.',
    };
    res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  next();
}

export function exigirPerfil(...perfis: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const utilizador = req.session.utilizador;
    if (!utilizador) {
      const erro = new ErroNaoAutenticado();
      if (req.path.startsWith('/api')) {
        res.status(erro.status).json({ erro: erro.message });
        return;
      }
      res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
      return;
    }
    if (!perfis.includes(utilizador.perfil)) {
      const erro = new ErroNaoAutorizado();
      if (req.path.startsWith('/api')) {
        res.status(erro.status).json({ erro: erro.message });
        return;
      }
      res.status(403).render('errors/403', {
        titulo: 'Acesso negado',
        mensagem: 'O seu perfil não tem permissão para aceder a esta área.',
      });
      return;
    }
    next();
  };
}

/**
 * Obriga a definir uma nova palavra-passe quando a atual tem mais de 6 meses.
 * A página de alteração e o logout ficam sempre acessíveis.
 */
export function exigirPasswordEmDia(req: Request, res: Response, next: NextFunction): void {
  const utilizador = req.session.utilizador;
  if (!utilizador) {
    next();
    return;
  }
  if (
    req.path === '/conta/password' ||
    req.path === '/logout' ||
    req.path.startsWith('/api')
  ) {
    next();
    return;
  }
  if (passwordExpirada(utilizador.passwordChangedAt)) {
    req.session.flash = {
      tipo: 'warning',
      mensagem: 'A sua palavra-passe expirou. Defina uma nova para continuar a usar o MediAgenda.',
    };
    res.redirect('/conta/password?expirada=1');
    return;
  }
  next();
}
