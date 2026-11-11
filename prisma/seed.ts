import { randomUUID } from 'node:crypto';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {
  // .env opcional
}

process.env.DATABASE_URL ??= 'file:./dev.db';

const prisma = new PrismaClient();
const SENHA_DEMO = 'Medi@2026';

const CONFIGURACOES: Array<{ chave: string; valor: string; descricao: string }> = [
  { chave: 'nome_clinica', valor: 'MediAgenda - Clinica Central', descricao: 'Nome apresentado no site.' },
  { chave: 'horario_abertura', valor: '08:00', descricao: 'Hora de abertura da clinica (RN-09).' },
  { chave: 'horario_fecho', valor: '20:00', descricao: 'Hora de fecho da clinica (RN-09).' },
  { chave: 'dias_funcionamento', valor: '1,2,3,4,5', descricao: 'Dias de funcionamento (0=domingo).' },
  { chave: 'antecedencia_minima_horas', valor: '1', descricao: 'Antecedencia minima para marcar (RN-01).' },
  { chave: 'limite_cancelamento_horas', valor: '24', descricao: 'Limite para cancelamento nao tardio (RN-06).' },
  { chave: 'max_consultas_paciente_medico', valor: '3', descricao: 'Maximo de consultas futuras por paciente/medico (RN-03).' },
  { chave: 'expiracao_confirmacao_horas', valor: '2', descricao: 'Prazo de confirmacao da marcacao (RN-07).' },
  { chave: 'duracao_padrao_minutos', valor: '60', descricao: 'Duracao padrao de uma consulta (RN-04).' },
];

const ESPECIALIDADES = [
  { nome: 'Cardiologia', descricao: 'Doencas do coracao e sistema cardiovascular.', duracaoPadraoMinutos: 60 },
  { nome: 'Clinica Geral', descricao: 'Consultas gerais, check-ups e encaminhamento.', duracaoPadraoMinutos: 60 },
  { nome: 'Pediatria', descricao: 'Saude de criancas e adolescentes.', duracaoPadraoMinutos: 60 },
  { nome: 'Dermatologia', descricao: 'Pele, cabelo e unhas.', duracaoPadraoMinutos: 60 },
  { nome: 'Ortopedia', descricao: 'Ossos, musculos e articulacoes.', duracaoPadraoMinutos: 60 },
  { nome: 'Ginecologia', descricao: 'Saude da mulher.', duracaoPadraoMinutos: 60 },
  { nome: 'Oftalmologia', descricao: 'Visao e saude ocular.', duracaoPadraoMinutos: 60 },
  { nome: 'Neurologia', descricao: 'Sistema nervoso.', duracaoPadraoMinutos: 60 },
];

function proximoDiaUtil(offset: number, base = new Date()): Date {
  const data = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let encontrados = 0;
  while (encontrados < offset) {
    data.setDate(data.getDate() + 1);
    if (data.getDay() !== 0 && data.getDay() !== 6) encontrados += 1;
  }
  return data;
}

function diaUtilAnterior(offset: number, base = new Date()): Date {
  const data = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  let encontrados = 0;
  while (encontrados < offset) {
    data.setDate(data.getDate() - 1);
    if (data.getDay() !== 0 && data.getDay() !== 6) encontrados += 1;
  }
  return data;
}

function hora(data: Date, valor: string): Date {
  const [h, m] = valor.split(':').map(Number);
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), h ?? 0, m ?? 0, 0, 0);
}

function maisMinutos(data: Date, minutos: number): Date {
  return new Date(data.getTime() + minutos * 60_000);
}

async function main(): Promise<void> {
  console.log('A preparar dados de demonstracao do MediAgenda...');

  for (const configuracao of CONFIGURACOES) {
    await prisma.configuracao.upsert({
      where: { chave: configuracao.chave },
      update: {},
      create: configuracao,
    });
  }

  const especialidades = new Map<string, string>();
  for (const item of ESPECIALIDADES) {
    const registo = await prisma.especialidade.upsert({
      where: { nome: item.nome },
      update: { descricao: item.descricao, ativa: true },
      create: item,
    });
    especialidades.set(item.nome, registo.id);
  }

  const passwordHash = await bcrypt.hash(SENHA_DEMO, 10);

  async function criarUtilizador(dados: {
    nome: string;
    email: string;
    perfil: string;
    telefone?: string;
    preferenciaNotificacao?: string;
  }) {
    return prisma.utilizador.upsert({
      where: { email: dados.email },
      update: {
        nome: dados.nome,
        perfil: dados.perfil,
        telefone: dados.telefone ?? null,
        ativo: true,
        emailConfirmado: true,
        passwordHash,
      },
      create: {
        nome: dados.nome,
        email: dados.email,
        passwordHash,
        perfil: dados.perfil,
        telefone: dados.telefone ?? null,
        preferenciaNotificacao: dados.preferenciaNotificacao ?? 'EMAIL',
        ativo: true,
        emailConfirmado: true,
      },
    });
  }

  async function criarMedico(dados: {
    nome: string;
    email: string;
    telefone: string;
    numeroRegisto: string;
    localizacao: string;
    bio: string;
    especialidades: string[];
    duracaoConsultaMinutos?: number;
    maxConsultasDia?: number;
  }) {
    const utilizador = await criarUtilizador({
      nome: dados.nome,
      email: dados.email,
      perfil: 'MEDICO',
      telefone: dados.telefone,
    });

    const medico = await prisma.medico.upsert({
      where: { utilizadorId: utilizador.id },
      update: {
        numeroRegisto: dados.numeroRegisto,
        telefone: dados.telefone,
        localizacao: dados.localizacao,
        bio: dados.bio,
        ativo: true,
        duracaoConsultaMinutos: dados.duracaoConsultaMinutos ?? 60,
        maxConsultasDia: dados.maxConsultasDia ?? 10,
      },
      create: {
        utilizadorId: utilizador.id,
        numeroRegisto: dados.numeroRegisto,
        telefone: dados.telefone,
        localizacao: dados.localizacao,
        bio: dados.bio,
        duracaoConsultaMinutos: dados.duracaoConsultaMinutos ?? 60,
        maxConsultasDia: dados.maxConsultasDia ?? 10,
      },
    });

    await prisma.medicoEspecialidade.deleteMany({ where: { medicoId: medico.id } });
    await prisma.medicoEspecialidade.createMany({
      data: dados.especialidades.map((nome) => ({
        medicoId: medico.id,
        especialidadeId: especialidades.get(nome)!,
      })),
    });

    await prisma.disponibilidade.deleteMany({ where: { medicoId: medico.id } });
    await prisma.disponibilidade.createMany({
      data: [1, 2, 3, 4, 5].flatMap((diaSemana) => [
        { medicoId: medico.id, diaSemana, horaInicio: '08:00', horaFim: '12:00' },
        { medicoId: medico.id, diaSemana, horaInicio: '14:00', horaFim: '18:00' },
      ]),
    });

    return medico;
  }

  async function criarPaciente(dados: {
    nome: string;
    email: string;
    telefone: string;
    dataNascimento: string;
    endereco: string;
    preferenciaNotificacao?: string;
  }) {
    const utilizador = await criarUtilizador({
      nome: dados.nome,
      email: dados.email,
      perfil: 'PACIENTE',
      telefone: dados.telefone,
      preferenciaNotificacao: dados.preferenciaNotificacao,
    });

    return prisma.paciente.upsert({
      where: { utilizadorId: utilizador.id },
      update: {
        telefone: dados.telefone,
        endereco: dados.endereco,
        dataNascimento: new Date(dados.dataNascimento),
      },
      create: {
        utilizadorId: utilizador.id,
        telefone: dados.telefone,
        endereco: dados.endereco,
        dataNascimento: new Date(dados.dataNascimento),
      },
    });
  }

  const admin = await criarUtilizador({
    nome: 'Administrador MediAgenda',
    email: 'admin@mediagenda.co.mz',
    perfil: 'ADMINISTRADOR',
    telefone: '+258 84 100 0001',
  });

  const secretaria = await criarUtilizador({
    nome: 'Secretaria da Clinica',
    email: 'secretaria@mediagenda.co.mz',
    perfil: 'SECRETARIO',
    telefone: '+258 84 100 0002',
  });

  const drRicardo = await criarMedico({
    nome: 'Dr. Ricardo Mabote',
    email: 'medico@mediagenda.co.mz',
    telefone: '+258 84 200 0001',
    numeroRegisto: 'MED-001',
    localizacao: 'Clinica Central, Maputo',
    bio: 'Cardiologista com 15 anos de experiencia em prevencao e reabilitacao cardiovascular.',
    especialidades: ['Cardiologia', 'Clinica Geral'],
  });

  const draSofia = await criarMedico({
    nome: 'Dra. Sofia Nhantumbo',
    email: 'sofia.medico@mediagenda.co.mz',
    telefone: '+258 84 200 0002',
    numeroRegisto: 'MED-002',
    localizacao: 'Clinica Central, Maputo',
    bio: 'Pediatra dedicada ao acompanhamento do crescimento e desenvolvimento infantil.',
    especialidades: ['Pediatria', 'Clinica Geral'],
    maxConsultasDia: 12,
  });

  const drMiguel = await criarMedico({
    nome: 'Dr. Miguel Cossa',
    email: 'miguel.medico@mediagenda.co.mz',
    telefone: '+258 84 200 0003',
    numeroRegisto: 'MED-003',
    localizacao: 'Clinica Central, Maputo',
    bio: 'Ortopedista especializado em traumatologia desportiva e cirurgia articular.',
    especialidades: ['Ortopedia'],
  });

  const ana = await criarPaciente({
    nome: 'Ana Silva',
    email: 'paciente@mediagenda.co.mz',
    telefone: '+258 84 300 0001',
    dataNascimento: '1990-05-12',
    endereco: 'Bairro Polana, Maputo',
  });

  const joao = await criarPaciente({
    nome: 'Joao Tembe',
    email: 'joao.paciente@mediagenda.co.mz',
    telefone: '+258 84 300 0002',
    dataNascimento: '1985-11-03',
    endereco: 'Bairro Matola, Maputo',
    preferenciaNotificacao: 'SMS',
  });

  const maria = await criarPaciente({
    nome: 'Maria Chissano',
    email: 'maria.paciente@mediagenda.co.mz',
    telefone: '+258 84 300 0003',
    dataNascimento: '1998-02-20',
    endereco: 'Bairro Costa do Sol, Maputo',
  });

  const totalConsultas = await prisma.consulta.count();
  if (totalConsultas === 0) {
    const primeiroDia = proximoDiaUtil(1);
    const segundoDia = proximoDiaUtil(2);
    const terceiroDia = proximoDiaUtil(3);
    const diaPassado = diaUtilAnterior(1);

    const consultaConfirmada = await prisma.consulta.create({
      data: {
        pacienteId: ana.id,
        medicoId: drRicardo.id,
        especialidadeId: especialidades.get('Cardiologia'),
        inicio: hora(primeiroDia, '09:00'),
        fim: hora(primeiroDia, '10:00'),
        estado: 'CONFIRMADA',
        motivo: 'Check-up cardiologico anual',
      },
    });

    await prisma.consulta.create({
      data: {
        pacienteId: joao.id,
        medicoId: draSofia.id,
        especialidadeId: especialidades.get('Pediatria'),
        inicio: hora(segundoDia, '10:00'),
        fim: hora(segundoDia, '11:00'),
        estado: 'PENDENTE',
        motivo: 'Avaliacao geral',
        confirmacaoToken: randomUUID(),
        expiraConfirmacaoEm: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    await prisma.consulta.create({
      data: {
        pacienteId: maria.id,
        medicoId: drMiguel.id,
        especialidadeId: especialidades.get('Ortopedia'),
        inicio: hora(terceiroDia, '14:00'),
        fim: hora(terceiroDia, '15:00'),
        estado: 'CONFIRMADA',
        motivo: 'Dor no joelho direito',
      },
    });

    const consultaRealizada = await prisma.consulta.create({
      data: {
        pacienteId: ana.id,
        medicoId: drRicardo.id,
        especialidadeId: especialidades.get('Clinica Geral'),
        inicio: hora(diaPassado, '09:00'),
        fim: hora(diaPassado, '10:00'),
        estado: 'REALIZADA',
        motivo: 'Consulta de rotina',
      },
    });

    await prisma.avaliacao.create({
      data: {
        consultaId: consultaRealizada.id,
        pacienteId: ana.id,
        medicoId: drRicardo.id,
        estrelas: 5,
        comentario: 'Atendimento excelente, explicou tudo com muita clareza.',
      },
    });

    await prisma.consulta.create({
      data: {
        pacienteId: maria.id,
        medicoId: drRicardo.id,
        especialidadeId: especialidades.get('Cardiologia'),
        inicio: hora(terceiroDia, '11:00'),
        fim: hora(terceiroDia, '12:00'),
        estado: 'CANCELADA',
        motivo: 'Avaliacao cardiovascular',
        motivoCancelamento: 'Paciente precisou de viajar de ultima hora.',
        canceladaPor: 'PACIENTE',
        cancelamentoTardio: false,
      },
    });

    await prisma.notificacao.create({
      data: {
        consultaId: consultaConfirmada.id,
        destinatario: 'paciente@mediagenda.co.mz',
        canal: 'EMAIL',
        assunto: 'Consulta confirmada - MediAgenda',
        corpo: `Ola Ana,\n\nA sua consulta com Dr. Ricardo Mabote foi confirmada para ${consultaConfirmada.inicio.toLocaleString('pt-PT')}.\n\nMediAgenda`,
        estado: 'SIMULADA',
      },
    });
  } else {
    console.log('Consultas ja existentes: dados de agenda de exemplo ignorados.');
  }

  console.log('');
  console.log('Dados de demonstracao criados com sucesso.');
  console.log(`  Especialidades: ${ESPECIALIDADES.length}`);
  console.log('  Contas (senha: Medi@2026):');
  console.log(`    ${admin.email} (ADMINISTRADOR)`);
  console.log(`    ${secretaria.email} (SECRETARIO)`);
  console.log('    medico@mediagenda.co.mz (MEDICO)');
  console.log('    paciente@mediagenda.co.mz (PACIENTE)');
  console.log('  Medicos de exemplo: Dr. Ricardo, Dra. Sofia, Dr. Miguel');
}

main()
  .catch((erro) => {
    console.error('Falha ao criar dados de demonstracao:', erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
