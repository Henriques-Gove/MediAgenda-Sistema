import { criarAplicacao } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

async function main(): Promise<void> {
  const { app, container } = await criarAplicacao();
  container.scheduler.iniciar(60_000);

  const servidor = app.listen(env.port, () => {
    console.log('');
    console.log('  MediAgenda - Sistema de Agendamento de Consultas Medicas');
    console.log(`  Ambiente: ${env.nodeEnv}`);
    console.log(`  Aplicacao: ${env.appUrl}`);
    console.log('');
    console.log('  Contas de demonstracao (senha: Medi@2026):');
    console.log('    admin@mediagenda.co.mz      -> Administrador');
    console.log('    secretaria@mediagenda.co.mz -> Secretaria');
    console.log('    medico@mediagenda.co.mz     -> Medico');
    console.log('    paciente@mediagenda.co.mz   -> Paciente');
    console.log('');
  });

  const encerrar = async (sinal: string) => {
    console.log(`\n[${sinal}] A encerrar o MediAgenda...`);
    container.scheduler.parar();
    servidor.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('SIGTERM', () => void encerrar('SIGTERM'));
}

main().catch((erro) => {
  console.error('Falha ao iniciar o MediAgenda:', erro);
  process.exit(1);
});
