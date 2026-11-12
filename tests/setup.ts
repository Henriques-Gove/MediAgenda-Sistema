/**
 * Garante que qualquer modulo carregado depois deste ficheiro (incluindo o
 * PrismaClient) usa a base de dados de testes e nao a base de desenvolvimento.
 */
import { urlBaseDados } from './urlBaseDados';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? urlBaseDados('test');
process.env.SESSION_SECRET = 'mediagenda-test-secret';
