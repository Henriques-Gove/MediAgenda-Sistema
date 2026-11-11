import type { Request } from 'express';
import { Perfil } from '../domain/enums';
import {
  adicionarDias,
  combinarDataHora,
  fimDaSemana,
  formatarData,
  formatarDataInput,
  formatarDiaSemana,
  formatarMes,
  inicioDaSemana,
  inicioDoMes,
} from '../lib/date';

export type VistaAgenda = 'dia' | 'semana' | 'mes';

export function vistaDaQuery(valor: unknown): VistaAgenda {
  return valor === 'semana' || valor === 'mes' ? valor : 'dia';
}

export interface NavegacaoAgenda {
  anterior: string;
  seguinte: string;
  rotulo: string;
  vista: VistaAgenda;
}

/** Calcula datas e rótulos de navegação para as vistas diária, semanal e mensal. */
export function navegacaoAgenda(data: Date, vista: VistaAgenda): NavegacaoAgenda {
  if (vista === 'semana') {
    const inicio = inicioDaSemana(data);
    const fim = fimDaSemana(data);
    return {
      anterior: formatarDataInput(adicionarDias(inicio, -7)),
      seguinte: formatarDataInput(adicionarDias(inicio, 7)),
      rotulo: `${formatarData(inicio)} – ${formatarData(fim)}`,
      vista,
    };
  }
  if (vista === 'mes') {
    const inicio = inicioDoMes(data);
    return {
      anterior: formatarDataInput(new Date(inicio.getFullYear(), inicio.getMonth() - 1, 1)),
      seguinte: formatarDataInput(new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1)),
      rotulo: formatarMes(data),
      vista,
    };
  }
  return {
    anterior: formatarDataInput(adicionarDias(data, -1)),
    seguinte: formatarDataInput(adicionarDias(data, 1)),
    rotulo: formatarDiaSemana(data),
    vista,
  };
}

export function destinoPorPerfil(perfil: string): string {
  switch (perfil) {
    case Perfil.PACIENTE:
      return '/paciente/dashboard';
    case Perfil.MEDICO:
      return '/medico/dashboard';
    case Perfil.SECRETARIO:
      return '/secretario/dashboard';
    case Perfil.ADMINISTRADOR:
      return '/admin/dashboard';
    default:
      return '/';
  }
}

/** Evita open redirect: so aceita caminhos internos. */
export function nextSeguro(valor: unknown, padrao: string): string {
  if (typeof valor !== 'string') return padrao;
  if (!valor.startsWith('/') || valor.startsWith('//')) return padrao;
  return valor;
}

export function dataDaQuery(valor: unknown): Date {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return combinarDataHora(valor, '00:00');
  }
  return combinarDataHora(formatarDataInput(new Date()), '00:00');
}

export function textoDaQuery(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
}

export function numeroDaQuery(valor: unknown): number | undefined {
  if (typeof valor !== 'string' || !valor.trim()) return undefined;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : undefined;
}

/** Devolve o URL atual sem o parâmetro `pagina`, pronto para os links da paginação. */
export function urlSemPagina(req: Request): string {
  const url = new URL(req.originalUrl, 'http://localhost');
  url.searchParams.delete('pagina');
  return `${url.pathname}${url.search}`;
}
