import type { PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { ConfiguracaoSistema } from '../config/ConfiguracaoSistema';
import { EstadoConsulta } from '../domain/enums';
import { fimDoDia, inicioDoDia } from '../lib/date';

export interface ResumoRelatorios {
  periodo: { desde: Date; ate: Date };
  totalConsultas: number;
  realizadas: number;
  confirmadas: number;
  pendentes: number;
  canceladas: number;
  taxaCancelamento: number;
  taxaOcupacao: number;
  capacidadeEstimada: number;
  medicosAtivos: number;
  consultasPorEspecialidade: Array<{ especialidade: string; total: number }>;
  satisfacaoPorMedico: Array<{ medico: string; media: number | null; total: number }>;
  consultasPorMes: Array<{ mes: string; total: number }>;
}

function contarDiasUteis(desde: Date, ate: Date, dias: number[]): number {
  let total = 0;
  const cursor = inicioDoDia(desde);
  const limite = fimDoDia(ate);
  while (cursor <= limite) {
    if (dias.includes(cursor.getDay())) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

/** Relatorios e estatisticas do administrador (RF-13). */
export class RelatorioService {
  constructor(
    private readonly db: PrismaClient = prismaPadrao,
    private readonly config: ConfiguracaoSistema = ConfiguracaoSistema.getInstance(),
  ) {}

  async resumo(desde: Date, ate: Date): Promise<ResumoRelatorios> {
    const intervalo = { gte: inicioDoDia(desde), lte: fimDoDia(ate) };

    const [total, realizadas, confirmadas, pendentes, canceladas, medicos, porEspecialidade, satisfacao, consultas] =
      await Promise.all([
        this.db.consulta.count({ where: { inicio: intervalo } }),
        this.db.consulta.count({ where: { inicio: intervalo, estado: EstadoConsulta.REALIZADA } }),
        this.db.consulta.count({ where: { inicio: intervalo, estado: EstadoConsulta.CONFIRMADA } }),
        this.db.consulta.count({ where: { inicio: intervalo, estado: EstadoConsulta.PENDENTE } }),
        this.db.consulta.count({ where: { inicio: intervalo, estado: EstadoConsulta.CANCELADA } }),
        this.db.medico.findMany({
          where: { ativo: true },
          select: { maxConsultasDia: true, utilizador: { select: { nome: true } }, id: true },
        }),
        this.db.consulta.groupBy({
          by: ['especialidadeId'],
          where: { inicio: intervalo },
          _count: { _all: true },
        }),
        this.db.avaliacao.groupBy({
          by: ['medicoId'],
          _avg: { estrelas: true },
          _count: { _all: true },
        }),
        this.db.consulta.findMany({
          where: { inicio: intervalo },
          select: { inicio: true },
        }),
      ]);

    const especialidades = await this.db.especialidade.findMany({
      select: { id: true, nome: true },
    });
    const nomesEspecialidades = new Map(especialidades.map((e) => [e.id, e.nome]));

    const nomesMedicos = new Map(medicos.map((m) => [m.id, m.utilizador.nome]));

    const diasUteis = contarDiasUteis(desde, ate, this.config.obterDiasFuncionamento());
    const capacidadePorDia = medicos.reduce((soma, medico) => soma + medico.maxConsultasDia, 0);
    const capacidadeEstimada = capacidadePorDia * diasUteis;
    const ocupadas = realizadas + confirmadas;

    const porMesMap = new Map<string, number>();
    for (const consulta of consultas) {
      const chave = `${consulta.inicio.getFullYear()}-${String(consulta.inicio.getMonth() + 1).padStart(2, '0')}`;
      porMesMap.set(chave, (porMesMap.get(chave) ?? 0) + 1);
    }

    return {
      periodo: { desde, ate },
      totalConsultas: total,
      realizadas,
      confirmadas,
      pendentes,
      canceladas,
      taxaCancelamento: total ? Number(((canceladas / total) * 100).toFixed(1)) : 0,
      taxaOcupacao: capacidadeEstimada
        ? Number(((ocupadas / capacidadeEstimada) * 100).toFixed(1))
        : 0,
      capacidadeEstimada,
      medicosAtivos: medicos.length,
      consultasPorEspecialidade: porEspecialidade
        .map((item) => ({
          especialidade: item.especialidadeId
            ? nomesEspecialidades.get(item.especialidadeId) ?? 'Sem especialidade'
            : 'Sem especialidade',
          total: item._count._all,
        }))
        .sort((a, b) => b.total - a.total),
      satisfacaoPorMedico: satisfacao
        .map((item) => ({
          medico: nomesMedicos.get(item.medicoId) ?? 'Medico removido',
          media: item._avg.estrelas ?? null,
          total: item._count._all,
        }))
        .sort((a, b) => (b.media ?? 0) - (a.media ?? 0)),
      consultasPorMes: [...porMesMap.entries()]
        .map(([mes, totalMes]) => ({ mes, total: totalMes }))
        .sort((a, b) => a.mes.localeCompare(b.mes)),
    };
  }

  async indicadoresHoje() {
    const hoje = new Date();
    const [consultasHoje, confirmadasHoje, canceladasHoje, novosPacientes] = await Promise.all([
      this.db.consulta.count({
        where: { inicio: { gte: inicioDoDia(hoje), lte: fimDoDia(hoje) } },
      }),
      this.db.consulta.count({
        where: {
          inicio: { gte: inicioDoDia(hoje), lte: fimDoDia(hoje) },
          estado: EstadoConsulta.CONFIRMADA,
        },
      }),
      this.db.consulta.count({
        where: {
          inicio: { gte: inicioDoDia(hoje), lte: fimDoDia(hoje) },
          estado: EstadoConsulta.CANCELADA,
        },
      }),
      this.db.paciente.count({ where: { criadoEm: { gte: inicioDoDia(hoje) } } }),
    ]);
    return { consultasHoje, confirmadasHoje, canceladasHoje, novosPacientes };
  }
}
