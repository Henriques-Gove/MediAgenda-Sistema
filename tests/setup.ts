/**
 * Garante que qualquer modulo carregado depois deste ficheiro (incluindo o
 * PrismaClient) usa a base de dados de testes e nao a base de desenvolvimento.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.SESSION_SECRET = 'mediagenda-test-secret';
