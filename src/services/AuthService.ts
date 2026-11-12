import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { generateSecret, generateURI, verify as verificarTotp } from 'otplib';
import { prisma as prismaPadrao } from '../lib/prisma';
import { env } from '../config/env';
import { Perfil, TiposEvento } from '../domain/enums';
import { ErroNaoEncontrado, ErroValidacao } from '../domain/errors';
import { somarHoras } from '../lib/date';
import { validarPassword } from '../lib/password';
import { montarPagina, type Pagina, type ParametrosPaginacao } from '../lib/pagination';
import { eventBus, type IPublicadorEventos } from '../events/EventBus';
import type { NotificacaoService } from './NotificacaoService';

export interface DadosPacienteRegisto {
  dataNascimento: Date | string;
  telefone: string;
  endereco: string;
}

export interface DadosMedicoRegisto {
  numeroRegisto: string;
  telefone: string;
  localizacao: string;
  bio?: string | null;
  especialidadeIds: string[];
  duracaoConsultaMinutos?: number;
  maxConsultasDia?: number;
}

export interface DadosRegisto {
  nome: string;
  email: string;
  password: string;
  perfil: Perfil;
  telefone?: string | null;
  preferenciaNotificacao?: string;
  paciente?: DadosPacienteRegisto;
  medico?: DadosMedicoRegisto;
  confirmarAutomaticamente?: boolean;
  aceiteTermos?: boolean;
}

export interface UtilizadorPublico {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  telefone: string | null;
  preferenciaNotificacao: string;
  ativo: boolean;
  emailConfirmado: boolean;
  twoFactorEnabled: boolean;
  passwordChangedAt: string;
  fotoUrl: string | null;
}

/** Servico de autenticacao, registo e recuperacao de credenciais (RF-01/RF-02). */
export class AuthService {
  constructor(
    private readonly db: PrismaClient = prismaPadrao,
    private readonly notificacoes?: NotificacaoService,
    private readonly bus: IPublicadorEventos = eventBus,
  ) {}

  async registar(dados: DadosRegisto): Promise<{ utilizador: UtilizadorPublico; tokenConfirmacao: string | null }> {
    const email = dados.email.trim().toLowerCase();
    if (!dados.nome || dados.nome.trim().length < 3) {
      throw new ErroValidacao('Indique o nome completo.', { nome: 'Nome demasiado curto.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ErroValidacao('E-mail invalido.', { email: 'Introduza um e-mail valido.' });
    }
    const errosPassword = validarPassword(dados.password);
    if (errosPassword.length) {
      throw new ErroValidacao('Palavra-passe demasiado fraca.', {
        password: errosPassword.join(' '),
      });
    }

    const existente = await this.db.utilizador.findUnique({ where: { email } });
    if (existente) {
      throw new ErroValidacao('Ja existe uma conta com este e-mail.', {
        email: 'Este e-mail ja esta registado.',
      });
    }

    if (dados.perfil === Perfil.PACIENTE && !dados.paciente) {
      throw new ErroValidacao('Dados de paciente em falta.');
    }
    if (dados.perfil === Perfil.MEDICO) {
      if (!dados.medico) throw new ErroValidacao('Dados de medico em falta.');
      if (!dados.medico.especialidadeIds?.length) {
        throw new ErroValidacao('Selecione pelo menos uma especialidade.');
      }
    }

    const passwordHash = await bcrypt.hash(dados.password, 10);
    const confirmado = dados.confirmarAutomaticamente ?? false;
    const tokenConfirmacao = confirmado ? null : randomUUID();

    const utilizador = await this.db.$transaction(async (tx) => {
      const criado = await tx.utilizador.create({
        data: {
          nome: dados.nome.trim(),
          email,
          passwordHash,
          perfil: dados.perfil,
          telefone: dados.telefone ?? null,
          preferenciaNotificacao: dados.preferenciaNotificacao ?? 'EMAIL',
          emailConfirmado: confirmado,
          tokenConfirmacao,
          consentimentoAceiteEm: dados.aceiteTermos ? new Date() : null,
        },
      });

      if (dados.perfil === Perfil.PACIENTE && dados.paciente) {
        await tx.paciente.create({
          data: {
            utilizadorId: criado.id,
            dataNascimento: new Date(dados.paciente.dataNascimento),
            telefone: dados.paciente.telefone,
            endereco: dados.paciente.endereco,
          },
        });
      }

      if (dados.perfil === Perfil.MEDICO && dados.medico) {
        await tx.medico.create({
          data: {
            utilizadorId: criado.id,
            numeroRegisto: dados.medico.numeroRegisto,
            telefone: dados.medico.telefone,
            localizacao: dados.medico.localizacao,
            bio: dados.medico.bio ?? null,
            duracaoConsultaMinutos: dados.medico.duracaoConsultaMinutos ?? 60,
            maxConsultasDia: dados.medico.maxConsultasDia ?? 10,
            especialidades: {
              create: dados.medico.especialidadeIds.map((especialidadeId) => ({
                especialidadeId,
              })),
            },
          },
        });
      }

      return criado;
    });

    if (tokenConfirmacao && this.notificacoes) {
      const link = `${env.appUrl}/confirmar-email/${tokenConfirmacao}`;
      await this.notificacoes.enviar({
        destinatario: email,
        canal: 'EMAIL',
        assunto: 'Confirme o seu e-mail - MediAgenda',
        corpo: `Ola ${utilizador.nome},\n\nBem-vindo ao MediAgenda. Confirme o seu e-mail no link abaixo:\n${link}\n\nMediAgenda`,
      });
    }

    await this.bus.publicar({
      tipo: TiposEvento.UTILIZADOR_REGISTADO,
      ocorridoEm: new Date(),
      utilizador: {
        id: utilizador.id,
        nome: utilizador.nome,
        email: utilizador.email,
        perfil: utilizador.perfil,
      },
    });

    return { utilizador: this.publico(utilizador), tokenConfirmacao };
  }

  async autenticar(
    email: string,
    password: string,
    ip?: string,
  ): Promise<UtilizadorPublico> {
    const agora = new Date();
    const utilizador = await this.db.utilizador.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (utilizador?.bloqueadoAte && utilizador.bloqueadoAte > agora) {
      throw new ErroValidacao(
        'Credenciais inválidas ou conta temporariamente bloqueada. Tente novamente mais tarde.',
        { email: 'E-mail ou palavra-passe incorretos.' },
      );
    }

    if (!utilizador || !(await bcrypt.compare(password, utilizador.passwordHash))) {
      if (utilizador) {
        const tentativas = utilizador.tentativasFalhas + 1;
        const bloquear = tentativas >= 5;
        await this.db.utilizador.update({
          where: { id: utilizador.id },
          data: {
            tentativasFalhas: bloquear ? 0 : tentativas,
            bloqueadoAte: bloquear ? new Date(agora.getTime() + 15 * 60 * 1000) : null,
          },
        });
      }
      throw new ErroValidacao('Credenciais inválidas.', {
        email: 'E-mail ou palavra-passe incorretos.',
      });
    }
    if (!utilizador.ativo) {
      throw new ErroValidacao('Conta desativada. Contacte o administrador.');
    }
    if (!utilizador.emailConfirmado) {
      throw new ErroValidacao(
        'Confirme o seu e-mail antes de iniciar sessão. Verifique a caixa de entrada.',
      );
    }

    if (utilizador.tentativasFalhas > 0 || utilizador.bloqueadoAte) {
      await this.db.utilizador.update({
        where: { id: utilizador.id },
        data: { tentativasFalhas: 0, bloqueadoAte: null },
      });
    }

    await this.bus.publicar({
      tipo: TiposEvento.LOGIN_REALIZADO,
      ocorridoEm: new Date(),
      utilizador: {
        id: utilizador.id,
        nome: utilizador.nome,
        email: utilizador.email,
        perfil: utilizador.perfil,
      },
      ip,
    });

    return this.publico(utilizador);
  }

  async confirmarEmail(token: string): Promise<UtilizadorPublico> {
    const utilizador = await this.db.utilizador.findUnique({
      where: { tokenConfirmacao: token },
    });
    if (!utilizador) throw new ErroNaoEncontrado('Link de confirmacao invalido ou ja utilizado.');

    const atualizado = await this.db.utilizador.update({
      where: { id: utilizador.id },
      data: { emailConfirmado: true, tokenConfirmacao: null },
    });
    return this.publico(atualizado);
  }

  async solicitarRecuperacao(email: string): Promise<string | null> {
    const utilizador = await this.db.utilizador.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!utilizador) return null;

    const token = randomUUID();
    await this.db.utilizador.update({
      where: { id: utilizador.id },
      data: {
        tokenRecuperacao: token,
        tokenRecuperacaoExpira: somarHoras(new Date(), 1),
      },
    });

    if (this.notificacoes) {
      const link = `${env.appUrl}/repor-password/${token}`;
      await this.notificacoes.enviar({
        destinatario: utilizador.email,
        canal: 'EMAIL',
        assunto: 'Recuperacao de palavra-passe - MediAgenda',
        corpo: `Ola ${utilizador.nome},\n\nRecebemos um pedido para redefinir a sua palavra-passe.\nUse o link abaixo (valido por 1 hora):\n${link}\n\nSe nao fez este pedido, ignore este e-mail.\n\nMediAgenda`,
      });
    }

    return token;
  }

  async redefinirPassword(token: string, novaPassword: string): Promise<void> {
    const errosPassword = validarPassword(novaPassword);
    if (errosPassword.length) {
      throw new ErroValidacao('A palavra-passe não cumpre os requisitos.', {
        password: errosPassword.join(' '),
      });
    }

    const utilizador = await this.db.utilizador.findFirst({
      where: {
        tokenRecuperacao: token,
        tokenRecuperacaoExpira: { gt: new Date() },
      },
    });
    if (!utilizador) throw new ErroNaoEncontrado('Link de recuperacao invalido ou expirado.');

    await this.db.utilizador.update({
      where: { id: utilizador.id },
      data: {
        passwordHash: await bcrypt.hash(novaPassword, 10),
        passwordChangedAt: new Date(),
        tokenRecuperacao: null,
        tokenRecuperacaoExpira: null,
      },
    });
  }

  async alterarPassword(utilizadorId: string, atual: string, nova: string): Promise<void> {
    const utilizador = await this.db.utilizador.findUnique({ where: { id: utilizadorId } });
    if (!utilizador) throw new ErroNaoEncontrado('Utilizador nao encontrado.');
    if (!(await bcrypt.compare(atual, utilizador.passwordHash))) {
      throw new ErroValidacao('Palavra-passe actual incorrecta.', {
        atual: 'Palavra-passe actual incorrecta.',
      });
    }
    const errosPassword = validarPassword(nova);
    if (errosPassword.length) {
      throw new ErroValidacao('A nova palavra-passe não cumpre os requisitos.', {
        password: errosPassword.join(' '),
      });
    }
    await this.db.utilizador.update({
      where: { id: utilizadorId },
      data: { passwordHash: await bcrypt.hash(nova, 10), passwordChangedAt: new Date() },
    });
  }

  async gerarSegredo2FA(utilizadorId: string): Promise<{ secret: string; otpauth: string }> {
    const utilizador = await this.db.utilizador.findUnique({ where: { id: utilizadorId } });
    if (!utilizador) throw new ErroNaoEncontrado('Utilizador não encontrado.');
    const secret = generateSecret();
    const otpauth = generateURI({ issuer: 'MediAgenda', label: utilizador.email, secret });
    return { secret, otpauth };
  }

  async ativar2FA(utilizadorId: string, secret: string, token: string): Promise<void> {
    const resultado = await verificarTotp({ secret, token });
    if (!resultado.valid) {
      throw new ErroValidacao('Código de verificação inválido.');
    }
    await this.db.utilizador.update({
      where: { id: utilizadorId },
      data: { twoFactorSecret: secret, twoFactorEnabled: true },
    });
  }

  async desativar2FA(utilizadorId: string, password: string): Promise<void> {
    const utilizador = await this.db.utilizador.findUnique({ where: { id: utilizadorId } });
    if (!utilizador) throw new ErroNaoEncontrado('Utilizador não encontrado.');
    if (!(await bcrypt.compare(password, utilizador.passwordHash))) {
      throw new ErroValidacao('Palavra-passe incorreta.', {
        password: 'Palavra-passe incorreta.',
      });
    }
    await this.db.utilizador.update({
      where: { id: utilizadorId },
      data: { twoFactorSecret: null, twoFactorEnabled: false },
    });
  }

  async validar2FA(utilizadorId: string, token: string): Promise<boolean> {
    const utilizador = await this.db.utilizador.findUnique({ where: { id: utilizadorId } });
    if (!utilizador?.twoFactorEnabled || !utilizador.twoFactorSecret) return false;
    const resultado = await verificarTotp({ secret: utilizador.twoFactorSecret, token });
    return resultado.valid;
  }

  async obterPorId(id: string): Promise<UtilizadorPublico> {
    const utilizador = await this.db.utilizador.findUnique({ where: { id } });
    if (!utilizador) throw new ErroNaoEncontrado('Utilizador nao encontrado.');
    return this.publico(utilizador);
  }

  async listarUtilizadores(filtros: { perfil?: string; busca?: string } = {}) {
    const termo = filtros.busca?.trim();
    return this.db.utilizador.findMany({
      where: {
        ...(filtros.perfil ? { perfil: filtros.perfil } : {}),
        ...(termo
          ? {
              OR: [
                { nome: { contains: termo } },
                { email: { contains: termo } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        telefone: true,
        ativo: true,
        emailConfirmado: true,
        criadoEm: true,
        paciente: { select: { id: true } },
        medico: { select: { id: true, numeroRegisto: true, ativo: true } },
      },
      orderBy: { criadoEm: 'desc' },
      take: 300,
    });
  }

  async listarUtilizadoresPaginado(
    filtros: { perfil?: string; busca?: string },
    paginacao: ParametrosPaginacao,
  ): Promise<Pagina<Awaited<ReturnType<AuthService['listarUtilizadores']>>[number]>> {
    const termo = filtros.busca?.trim();
    const where = {
      ...(filtros.perfil ? { perfil: filtros.perfil } : {}),
      ...(termo
        ? {
            OR: [
              { nome: { contains: termo } },
              { email: { contains: termo } },
            ],
          }
        : {}),
    };

    const total = await this.db.utilizador.count({ where });
    const totalPaginas = Math.max(1, Math.ceil(total / paginacao.porPagina));
    const pagina = Math.min(paginacao.pagina, totalPaginas);
    const itens = await this.db.utilizador.findMany({
      where,
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        telefone: true,
        ativo: true,
        emailConfirmado: true,
        criadoEm: true,
        paciente: { select: { id: true } },
        medico: { select: { id: true, numeroRegisto: true, ativo: true } },
      },
      orderBy: { criadoEm: 'desc' },
      skip: (pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
    });

    return montarPagina(itens, total, pagina, paginacao.porPagina);
  }

  async definirAtivo(utilizadorId: string, ativo: boolean): Promise<void> {
    const utilizador = await this.db.utilizador.findUnique({
      where: { id: utilizadorId },
      include: { medico: true },
    });
    if (!utilizador) throw new ErroNaoEncontrado('Utilizador nao encontrado.');

    await this.db.$transaction(async (tx) => {
      await tx.utilizador.update({ where: { id: utilizadorId }, data: { ativo } });
      if (utilizador.medico) {
        await tx.medico.update({ where: { id: utilizador.medico.id }, data: { ativo } });
      }
    });
  }

  async definirPerfil(utilizadorId: string, perfil: Perfil): Promise<void> {
    const utilizador = await this.db.utilizador.findUnique({
      where: { id: utilizadorId },
      include: { medico: true, paciente: true },
    });
    if (!utilizador) throw new ErroNaoEncontrado('Utilizador nao encontrado.');
    if (utilizador.perfil === perfil) throw new ErroValidacao('O utilizador ja tem este perfil.');

    await this.db.$transaction(async (tx) => {
      await tx.utilizador.update({ where: { id: utilizadorId }, data: { perfil } });

      // Quando se deixa de ser medico, desativa o registo medico (mantem historico)
      if (utilizador.perfil === 'MEDICO' && perfil !== 'MEDICO' && utilizador.medico) {
        await tx.medico.update({ where: { id: utilizador.medico.id }, data: { ativo: false } });
      }
      // Quando se torna medico e nao tem registo, cria um registo minimo
      if (perfil === 'MEDICO' && !utilizador.medico) {
        await tx.medico.create({
          data: {
            utilizadorId,
            numeroRegisto: 'PENDENTE',
            telefone: utilizador.telefone ?? '',
            localizacao: '',
            duracaoConsultaMinutos: 60,
            maxConsultasDia: 10,
            ativo: true,
          },
        });
      }
    });
  }

  async atualizarPreferencias(
    utilizadorId: string,
    dados: { nome?: string; telefone?: string | null; preferenciaNotificacao?: string },
  ): Promise<void> {
    await this.db.utilizador.update({
      where: { id: utilizadorId },
      data: {
        ...(dados.nome ? { nome: dados.nome.trim() } : {}),
        ...(dados.telefone !== undefined ? { telefone: dados.telefone } : {}),
        ...(dados.preferenciaNotificacao
          ? { preferenciaNotificacao: dados.preferenciaNotificacao }
          : {}),
      },
    });
  }

  async atualizarFoto(utilizadorId: string, fotoUrl: string | null): Promise<void> {
    await this.db.utilizador.update({
      where: { id: utilizadorId },
      data: { fotoUrl },
    });
  }

  private publico(utilizador: {
    id: string;
    nome: string;
    email: string;
    perfil: string;
    telefone: string | null;
    preferenciaNotificacao: string;
    ativo: boolean;
    emailConfirmado: boolean;
    twoFactorEnabled: boolean;
    passwordChangedAt: Date;
    fotoUrl: string | null;
  }): UtilizadorPublico {
    return {
      id: utilizador.id,
      nome: utilizador.nome,
      email: utilizador.email,
      perfil: utilizador.perfil,
      telefone: utilizador.telefone,
      preferenciaNotificacao: utilizador.preferenciaNotificacao,
      ativo: utilizador.ativo,
      emailConfirmado: utilizador.emailConfirmado,
      twoFactorEnabled: utilizador.twoFactorEnabled,
      passwordChangedAt: utilizador.passwordChangedAt.toISOString(),
      fotoUrl: utilizador.fotoUrl,
    };
  }
}
