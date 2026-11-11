declare module 'express-ejs-layouts' {
  import type { RequestHandler } from 'express';

  interface ExpressEjsLayouts {
    (): RequestHandler;
    render: (nome: string, opcoes: unknown, callback: (erro: Error | null, html?: string) => void) => void;
  }

  const expressLayouts: ExpressEjsLayouts;
  export = expressLayouts;
}
