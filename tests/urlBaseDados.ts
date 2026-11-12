import path from 'node:path';

try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {
  // .env opcional (em CI usam-se as variaveis do servico).
}

const URL_PREDEFINIDA =
  'postgresql://mediagenda:mediagenda@127.0.0.1:5432/mediagenda?schema=public';

/**
 * Devolve a connection string da base de testes com o schema indicado.
 * Parte de DATABASE_URL (ou do valor predefinido) e troca apenas o schema,
 * para que cada suite use dados isolados sem criar bases adicionais.
 */
export function urlBaseDados(schema: string): string {
  const url = new URL(process.env.DATABASE_URL ?? URL_PREDEFINIDA);
  url.searchParams.set('schema', schema);
  return url.toString();
}
