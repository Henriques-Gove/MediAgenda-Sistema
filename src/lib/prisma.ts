import { PrismaClient } from '@prisma/client';

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * O SQLite não suporta escritas concorrentes. Sem serialização, o `set` da
 * sessão no login pode colidir com o `touch` de outro pedido (por exemplo, o
 * service worker a pedir `/offline`) e a sessão acabada de criar perde-se.
 *
 * O Prisma usa por omissão um pool com várias ligações. Limitá-lo a uma única
 * ligação serializa as operações e elimina esse tipo de bloqueio. O parâmetro
 * é respeitado se já estiver presente no `DATABASE_URL`.
 */
function urlComLigacaoUnica(url: string | undefined): string | undefined {
  if (!url || !url.startsWith('file:')) return url;
  if (/[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=1`;
}

export const prisma =
  globalParaPrisma.prisma ??
  new PrismaClient({ datasourceUrl: urlComLigacaoUnica(process.env.DATABASE_URL) });

if (process.env.NODE_ENV !== 'production') {
  globalParaPrisma.prisma = prisma;
}
