import type { PrismaClient } from '@prisma/client';
import { montarPagina, type Pagina, type ParametrosPaginacao } from '../lib/pagination';
import { prisma as prismaPadrao } from '../lib/prisma';
import { CanalNotificacao, EstadoNotificacao } from '../domain/enums';
import type { NotificacaoFactory } from '../patterns/factory/NotificacaoFactory';
import type { ResultadoEnvio } from '../domain/notificacao/tipos';

export interface PedidoNotificacao {
  consultaId?: string | null;
  destinatario: string;
  canal: string;
  assunto: string;
  corpo: string;
  deduplicar?: boolean;
}

export interface DestinatarioPreferido {
  email: string;
  telefone?: string | null;
  preferencia: string;
}

/**
 * Orquestra o envio: escolhe a estrategia via Factory, envia pelo Adapter
 * adequado e persiste o resultado. Cumpre a RF-06.
 */
export class NotificacaoService {
  constructor(
    private readonly factory: NotificacaoFactory,
    private readonly db: PrismaClient = prismaPadrao,
  ) {}

  async enviar(pedido: PedidoNotificacao): Promise<ResultadoEnvio | null> {
    if (pedido.deduplicar && pedido.consultaId) {
      const existente = await this.db.notificacao.findFirst({
        where: {
          consultaId: pedido.consultaId,
          destinatario: pedido.destinatario,
          canal: pedido.canal,
          assunto: pedido.assunto,
        },
      });
      if (existente) return null;
    }

    const estrategia = this.factory.criar(pedido.canal);
    const resultado = await estrategia.enviar({
      destino: pedido.destinatario,
      assunto: pedido.assunto,
      corpo: pedido.corpo,
    });

    const estado = resultado.sucesso
      ? resultado.simulado
        ? EstadoNotificacao.SIMULADA
        : EstadoNotificacao.ENVIADA
      : EstadoNotificacao.FALHADA;

    await this.db.notificacao.create({
      data: {
        consultaId: pedido.consultaId ?? null,
        destinatario: pedido.destinatario,
        canal: pedido.canal,
        assunto: pedido.assunto,
        corpo: pedido.corpo,
        estado,
      },
    });

    return resultado;
  }

  /**
   * Envia respeitando a preferencia do utilizador. Se escolheu SMS mas nao tem
   * telefone, cai para e-mail (fallback) para nao perder a notificacao.
   */
  async enviarParaUtilizador(
    destinatario: DestinatarioPreferido,
    assunto: string,
    corpo: string,
    consultaId?: string | null,
  ): Promise<ResultadoEnvio | null> {
    const prefereSMS = destinatario.preferencia === CanalNotificacao.SMS;
    const canal = prefereSMS && destinatario.telefone ? CanalNotificacao.SMS : CanalNotificacao.EMAIL;
    const destino = canal === CanalNotificacao.SMS ? destinatario.telefone! : destinatario.email;

    return this.enviar({ consultaId, destinatario: destino, canal, assunto, corpo });
  }

  async listarPorConsulta(consultaId: string) {
    return this.db.notificacao.findMany({
      where: { consultaId },
      orderBy: { enviadoEm: 'desc' },
    });
  }

  async listarRecentes(limite = 100) {
    return this.db.notificacao.findMany({
      orderBy: { enviadoEm: 'desc' },
      take: limite,
      include: { consulta: { select: { inicio: true } } },
    });
  }

  async listarRecentesPaginado(
    paginacao: ParametrosPaginacao,
  ): Promise<Pagina<Awaited<ReturnType<NotificacaoService['listarRecentes']>>[number]>> {
    const total = await this.db.notificacao.count();
    const totalPaginas = Math.max(1, Math.ceil(total / paginacao.porPagina));
    const pagina = Math.min(paginacao.pagina, totalPaginas);
    const itens = await this.db.notificacao.findMany({
      orderBy: { enviadoEm: 'desc' },
      skip: (pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
      include: { consulta: { select: { inicio: true } } },
    });

    return montarPagina(itens, total, pagina, paginacao.porPagina);
  }
}
