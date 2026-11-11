import type { NextFunction, Request, Response } from 'express';

/**
 * Indica se o pedido atual deve consumir as mensagens flash da sessão.
 *
 * Só pedidos de navegação (ou clientes que não enviam `Sec-Fetch-Mode`, como
 * testes e integrações) consomem a mensagem. Pedidos de assets, chamadas do
 * service worker e a própria página offline nunca a roubam à página seguinte.
 */
function deveConsumirFlash(req: Request): boolean {
  if (req.path === '/offline') return false;
  const modo = req.get('sec-fetch-mode');
  if (!modo) return true;
  return modo === 'navigate';
}

/**
 * Transfere mensagens flash e erros de formulário da sessão para as views.
 *
 * A leitura acontece apenas quando uma página é efetivamente renderizada por
 * uma navegação. Pedidos de assets, verificações de saúde, redirecionamentos,
 * respostas de API e o pré-carregamento da página offline pelo service worker
 * não consomem a mensagem.
 */
export function flash(req: Request, res: Response, next: NextFunction): void {
  res.locals.flash = null;
  res.locals.erros = {};
  res.locals.valores = {};

  const renderOriginal = res.render.bind(res) as (...args: unknown[]) => void;

  res.render = ((...args: unknown[]) => {
    const consumir = deveConsumirFlash(req);
    res.locals.flash = consumir ? (req.session.flash ?? null) : null;
    res.locals.erros = consumir ? (req.session.erros ?? {}) : {};
    res.locals.valores = consumir ? (req.session.valores ?? {}) : {};
    if (consumir) {
      delete req.session.flash;
      delete req.session.erros;
      delete req.session.valores;
    }
    return renderOriginal(...args);
  }) as Response['render'];

  next();
}
