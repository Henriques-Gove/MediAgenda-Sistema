export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
  temAnterior: boolean;
  temSeguinte: boolean;
  primeiro: number;
  ultimo: number;
}

export interface ParametrosPaginacao {
  pagina: number;
  porPagina: number;
  skip: number;
  take: number;
}

export function paginacaoDaQuery(
  query: Record<string, unknown>,
  porPaginaPadrao = 15,
): ParametrosPaginacao {
  const pagina = Math.max(1, Number(query.pagina) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(query.porPagina) || porPaginaPadrao));
  return {
    pagina,
    porPagina,
    skip: (pagina - 1) * porPagina,
    take: porPagina,
  };
}

export function montarPagina<T>(
  itens: T[],
  total: number,
  pagina: number,
  porPagina: number,
): Pagina<T> {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  return {
    itens,
    total,
    pagina: paginaAtual,
    porPagina,
    totalPaginas,
    temAnterior: paginaAtual > 1,
    temSeguinte: paginaAtual < totalPaginas,
    primeiro: total === 0 ? 0 : (paginaAtual - 1) * porPagina + 1,
    ultimo: Math.min(paginaAtual * porPagina, total),
  };
}
