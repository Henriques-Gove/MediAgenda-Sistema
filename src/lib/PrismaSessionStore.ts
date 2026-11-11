import { Store, type SessionData } from 'express-session';
import type { PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from './prisma';

type Callback = (err?: unknown, sess?: SessionData | null) => void;

/**
 * Store de sessoes persistido na base de dados.
 * Evita o MemoryStore do express-session, que perde sessões ao reiniciar
 * e não funciona corretamente com mais do que um processo.
 */
export class PrismaSessionStore extends Store {
  constructor(private readonly db: PrismaClient = prismaPadrao) {
    super();
  }

  override get(sid: string, callback: Callback): void {
    this.db.sessao
      .findUnique({ where: { sid } })
      .then(async (registo) => {
        if (!registo) {
          callback(null, null);
          return;
        }
        if (registo.expiraEm.getTime() <= Date.now()) {
          await this.db.sessao.delete({ where: { sid } }).catch(() => undefined);
          callback(null, null);
          return;
        }
        callback(null, JSON.parse(registo.dados) as SessionData);
      })
      .catch((erro) => callback(erro));
  }

  override set(sid: string, sess: SessionData, callback: Callback): void {
    const expiraEm = this.calcularExpiracao(sess);
    this.db.sessao
      .upsert({
        where: { sid },
        create: { sid, dados: JSON.stringify(sess), expiraEm },
        update: { dados: JSON.stringify(sess), expiraEm },
      })
      .then(() => callback(null))
      .catch((erro) => callback(erro));
  }

  override destroy(sid: string, callback: Callback): void {
    this.db.sessao
      .delete({ where: { sid } })
      .catch(() => undefined)
      .then(() => callback(null));
  }

  override touch(sid: string, sess: SessionData, callback: Callback): void {
    const expiraEm = this.calcularExpiracao(sess);
    this.db.sessao
      .update({ where: { sid }, data: { expiraEm } })
      .then(() => callback(null))
      .catch((erro) => callback(erro));
  }

  async limparExpiradas(): Promise<number> {
    const resultado = await this.db.sessao.deleteMany({
      where: { expiraEm: { lt: new Date() } },
    });
    return resultado.count;
  }

  private calcularExpiracao(sess: SessionData): Date {
    const expira = sess.cookie?.expires;
    if (expira) return new Date(expira);
    return new Date(Date.now() + 8 * 60 * 60 * 1000);
  }
}
