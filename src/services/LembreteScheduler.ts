import type { PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { TiposEvento } from '../domain/enums';
import type { ConsultaService } from '../services/ConsultaService';

/**
 * Agendador de lembretes (RF-06) e expiracao de confirmacoes (RN-07).
 * Corre periodicamente e publica eventos no barramento; nao envia nada
 * directamente, mantendo o baixo acoplamento da EDA.
 */
export class LembreteScheduler {
  private intervalo: NodeJS.Timeout | null = null;
  private emExecucao = false;

  constructor(
    private readonly consultas: ConsultaService,
    private readonly db: PrismaClient = prismaPadrao,
  ) {}

  iniciar(intervaloMs = 60_000): void {
    if (this.intervalo) return;
    void this.executarCiclo();
    this.intervalo = setInterval(() => void this.executarCiclo(), intervaloMs);
    this.intervalo.unref?.();
  }

  parar(): void {
    if (this.intervalo) {
      clearInterval(this.intervalo);
      this.intervalo = null;
    }
  }

  async executarCiclo(agora = new Date()): Promise<void> {
    if (this.emExecucao) return;
    this.emExecucao = true;
    try {
      await this.consultas.expirarPendentes(agora);

      const limite = new Date(agora.getTime() + 26 * 3_600_000);
      const proximas = await this.db.consulta.findMany({
        where: {
          estado: 'CONFIRMADA',
          inicio: { gte: agora, lte: limite },
        },
        include: {
          paciente: { include: { utilizador: true } },
          medico: { include: { utilizador: true } },
          especialidade: true,
          avaliacao: true,
        },
        orderBy: { inicio: 'asc' },
      });

      for (const consulta of proximas) {
        const horas = (consulta.inicio.getTime() - agora.getTime()) / 3_600_000;

        if (horas <= 24.5 && horas > 1.5 && !(await this.jaNotificado(consulta.id, '24H'))) {
          await this.consultas.publicar(consulta, TiposEvento.LEMBRETE_DEVIDO, {}, {
            antecedencia: '24h',
          });
        }

        if (horas <= 1.5 && !(await this.jaNotificado(consulta.id, '1H'))) {
          await this.consultas.publicar(consulta, TiposEvento.LEMBRETE_DEVIDO, {}, {
            antecedencia: '1h',
          });
        }
      }
    } finally {
      this.emExecucao = false;
    }
  }

  private async jaNotificado(consultaId: string, marcador: '24H' | '1H'): Promise<boolean> {
    const registo = await this.db.notificacao.findFirst({
      where: {
        consultaId,
        assunto: { contains: `[LEMBRETE_${marcador}]` },
      },
      select: { id: true },
    });
    return Boolean(registo);
  }
}
