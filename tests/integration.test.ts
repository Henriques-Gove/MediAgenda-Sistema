import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAplicacao } from '../src/app';
import { CONFIGURACOES_PADRAO } from '../src/config/ConfiguracaoSistema';
import { formatarDataInput } from '../src/lib/date';
import { prisma } from '../src/lib/prisma';

const SENHA = 'Medi@2026';
const EMAIL_PACIENTE = 'paciente.teste@mediagenda.co.mz';
const EMAIL_MEDICO = 'medico.teste@mediagenda.co.mz';
const EMAIL_ADMIN = 'admin.teste@mediagenda.co.mz';

let app: Express;
let pacienteId: string;
let medicoId: string;
let especialidadeId: string;

function proximoDiaUtil(): Date {
  const data = new Date();
  data.setHours(10, 0, 0, 0);
  do {
    data.setDate(data.getDate() + 1);
  } while (data.getDay() === 0 || data.getDay() === 6);
  return data;
}

async function limparBaseDeDados(): Promise<void> {
  await prisma.avaliacao.deleteMany();
  await prisma.notificacao.deleteMany();
  await prisma.auditoria.deleteMany();
  await prisma.consulta.deleteMany();
  await prisma.bloqueio.deleteMany();
  await prisma.disponibilidade.deleteMany();
  await prisma.medicoEspecialidade.deleteMany();
  await prisma.medico.deleteMany();
  await prisma.paciente.deleteMany();
  await prisma.especialidade.deleteMany();
  await prisma.configuracao.deleteMany();
  await prisma.utilizador.deleteMany();
}

async function criarContasDeTeste(): Promise<void> {
  const passwordHash = await bcrypt.hash(SENHA, 4);

  const pacienteUser = await prisma.utilizador.create({
    data: {
      nome: 'Paciente Teste',
      email: EMAIL_PACIENTE,
      passwordHash,
      perfil: 'PACIENTE',
      telefone: '+258840000001',
      emailConfirmado: true,
    },
  });

  const paciente = await prisma.paciente.create({
    data: {
      utilizadorId: pacienteUser.id,
      dataNascimento: new Date('1990-01-01'),
      telefone: '+258840000001',
      endereco: 'Maputo',
    },
  });
  pacienteId = paciente.id;

  const medicoUser = await prisma.utilizador.create({
    data: {
      nome: 'Dr. Teste',
      email: EMAIL_MEDICO,
      passwordHash,
      perfil: 'MEDICO',
      telefone: '+258840000002',
      emailConfirmado: true,
    },
  });

  const medico = await prisma.medico.create({
    data: {
      utilizadorId: medicoUser.id,
      numeroRegisto: 'TEST-001',
      telefone: '+258840000002',
      localizacao: 'Maputo',
      bio: 'Medico de teste',
      duracaoConsultaMinutos: 60,
      maxConsultasDia: 10,
    },
  });
  medicoId = medico.id;

  const especialidade = await prisma.especialidade.create({
    data: {
      nome: 'Cardiologia',
      descricao: 'Especialidade de teste',
      duracaoPadraoMinutos: 60,
    },
  });
  especialidadeId = especialidade.id;

  await prisma.medicoEspecialidade.create({
    data: { medicoId: medico.id, especialidadeId: especialidade.id },
  });

  await prisma.disponibilidade.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      medicoId: medico.id,
      diaSemana,
      horaInicio: '08:00',
      horaFim: '18:00',
    })),
  });

  await prisma.utilizador.create({
    data: {
      nome: 'Admin Teste',
      email: EMAIL_ADMIN,
      passwordHash,
      perfil: 'ADMINISTRADOR',
      telefone: '+258840000003',
      emailConfirmado: true,
    },
  });
}

beforeAll(async () => {
  await limparBaseDeDados();

  await prisma.configuracao.createMany({
    data: Object.entries(CONFIGURACOES_PADRAO).map(([chave, valor]) => ({
      chave,
      valor,
      descricao: 'Configuracao de teste',
    })),
  });

  await criarContasDeTeste();

  const aplicacao = await criarAplicacao();
  app = aplicacao.app;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Integracao - paginas publicas e API', () => {
  it('apresenta a pagina inicial', async () => {
    const resposta = await request(app).get('/').expect(200);
    expect(resposta.text).toContain('MediAgenda');
  });

  it('lista medicos publicamente', async () => {
    const resposta = await request(app).get('/medicos').expect(200);
    expect(resposta.text).toContain('Dr. Teste');
  });

  it('disponibiliza o endpoint de saude', async () => {
    const resposta = await request(app).get('/api/health').expect(200);
    expect(resposta.body).toMatchObject({ estado: 'ok', servico: 'MediAgenda' });
  });

  it('disponibiliza as especialidades na API', async () => {
    const resposta = await request(app).get('/api/especialidades').expect(200);
    expect(Array.isArray(resposta.body)).toBe(true);
    expect(resposta.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ nome: 'Cardiologia' })]),
    );
  });
});

describe('Integracao - autenticacao e RBAC', () => {
  it('redireciona utilizadores nao autenticados para o login', async () => {
    await request(app)
      .get('/paciente/dashboard')
      .expect(302)
      .expect('Location', /\/login\?next=/);
  });

  it('rejeita credenciais invalidas', async () => {
    await request(app)
      .post('/login')
      .type('form')
      .send({ email: EMAIL_PACIENTE, password: 'palavra-passe-errada' })
      .expect(302)
      .expect('Location', '/login');
  });

  it('autentica o paciente e impede o acesso a area de administracao', async () => {
    const agente = request.agent(app);

    await agente
      .post('/login')
      .type('form')
      .send({ email: EMAIL_PACIENTE, password: SENHA })
      .expect(302)
      .expect('Location', '/paciente/dashboard');

    await agente.get('/paciente/dashboard').expect(200);
    await agente.get('/admin/dashboard').expect(403);
  });

  it('autentica o administrador e permite consultar os relatorios', async () => {
    const agente = request.agent(app);

    await agente
      .post('/login')
      .type('form')
      .send({ email: EMAIL_ADMIN, password: SENHA })
      .expect(302)
      .expect('Location', '/admin/dashboard');

    await agente.get('/admin/dashboard').expect(200);
    await agente.get('/admin/relatorios').expect(200);
  });
});

describe('Integracao - marcacao e confirmacao de consulta', () => {
  it('marca uma consulta pendente, gera token e confirma-a', async () => {
    const agente = request.agent(app);
    await agente
      .post('/login')
      .type('form')
      .send({ email: EMAIL_PACIENTE, password: SENHA })
      .expect(302);

    const data = formatarDataInput(proximoDiaUtil());

    await agente
      .post('/paciente/consultas')
      .type('form')
      .send({
        medicoId,
        especialidadeId,
        data,
        hora: '10:00',
        motivo: 'Dor de cabeca persistente',
      })
      .expect(302)
      .expect('Location', '/paciente/consultas');

    const consulta = await prisma.consulta.findFirst({
      where: { pacienteId, medicoId },
      orderBy: { criadoEm: 'desc' },
    });

    expect(consulta).not.toBeNull();
    expect(consulta?.estado).toBe('PENDENTE');
    expect(consulta?.confirmacaoToken).toBeTruthy();

    await agente.get(`/confirmar/${consulta!.confirmacaoToken}`).expect(302);

    const confirmada = await prisma.consulta.findUnique({ where: { id: consulta!.id } });
    expect(confirmada?.estado).toBe('CONFIRMADA');
    expect(confirmada?.confirmacaoToken).toBeNull();
  });

  it('impede marcacoes com menos de 1 hora de antecedencia (RN-01)', async () => {
    const agente = request.agent(app);
    await agente
      .post('/login')
      .type('form')
      .send({ email: EMAIL_PACIENTE, password: SENHA })
      .expect(302);

    const agora = new Date();
    const data = formatarDataInput(agora);
    const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;

    await agente
      .post('/paciente/consultas')
      .type('form')
      .send({ medicoId, especialidadeId, data, hora, motivo: 'Teste RN-01' })
      .expect(302);

    const consulta = await prisma.consulta.findFirst({
      where: { pacienteId, motivo: 'Teste RN-01' },
    });
    expect(consulta).toBeNull();
  });
});
