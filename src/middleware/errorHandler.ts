import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ErroAplicacao } from '../domain/errors';
import { logger } from '../lib/logger';

export function tratarErros(
  erro: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const erroAplicacao = erro instanceof ErroAplicacao ? erro : null;
  const erroUpload = erro instanceof multer.MulterError ? erro : null;

  let status = erroAplicacao?.status ?? 500;
  let mensagem =
    erroAplicacao?.message ??
    (erro instanceof Error ? erro.message : 'Ocorreu um erro inesperado.');

  if (erroUpload) {
    status = erroUpload.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    mensagem =
      erroUpload.code === 'LIMIT_FILE_SIZE'
        ? 'O ficheiro é demasiado grande. O limite é de 5 MB.'
        : 'Não foi possível processar o ficheiro enviado.';
  }

  if (status >= 500) {
    logger.error('erro não tratado', {
      requestId: res.locals.requestId,
      metodo: req.method,
      rota: req.originalUrl.split('?')[0],
      erro: erro instanceof Error ? erro.message : String(erro),
      pilha: erro instanceof Error ? erro.stack : undefined,
    });
  }

  if (req.path.startsWith('/api')) {
    res.status(status).json({
      erro: status >= 500 ? 'Erro interno do servidor.' : mensagem,
      codigo: erroAplicacao?.codigo ?? 'ERRO_INTERNO',
    });
    return;
  }

  // Formularios: volta a pagina anterior com uma mensagem clara.
  if ((erroAplicacao || erroUpload) && req.method === 'POST' && status < 500) {
    req.session.flash = { tipo: 'danger', mensagem };
    const destino = req.get('referer') ?? '/';
    res.redirect(destino);
    return;
  }

  res.status(status).render('errors/erro', {
    titulo: status === 404 ? 'Página não encontrada' : 'Ocorreu um erro',
    status,
    mensagem: status >= 500 ? 'Ocorreu um erro inesperado. Tente novamente.' : mensagem,
  });
}
