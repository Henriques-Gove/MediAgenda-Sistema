import { PrismaClient } from '@prisma/client';

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Cliente Prisma partilhado. Em desenvolvimento, o cliente fica guardado no
 * objeto global para o hot reload do tsx nao abrir uma ligacao nova a cada
 * alteracao. Em producao e criada uma unica instancia por processo.
 */
export const prisma = globalParaPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalParaPrisma.prisma = prisma;
}
