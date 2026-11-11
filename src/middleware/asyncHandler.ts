import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 nao apanha rejeicoes de handlers async; este wrapper encaminha-as. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
