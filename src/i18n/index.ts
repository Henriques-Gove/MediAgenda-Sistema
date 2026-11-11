/**
 * Infraestrutura de internacionalização.
 *
 * A interface está atualmente em português (pt-PT). Os textos vivem neste
 * dicionário para que novos idiomas possam ser adicionados sem alterar as
 * vistas. Chaves em falta caem para português e, em último recurso, para a
 * própria chave.
 */
export const idiomasDisponiveis = ['pt-PT'] as const;
export type Idioma = (typeof idiomasDisponiveis)[number];
export const idiomaPadrao: Idioma = 'pt-PT';

type Dicionario = Record<string, string>;

const ptPT: Dicionario = {
  'app.nome': 'MediAgenda',
  'app.descricao': 'Marcação de consultas médicas simples, rápida e segura.',
  'nav.inicio': 'Início',
  'nav.medicos': 'Médicos',
  'nav.sobre': 'Sobre',
  'nav.entrar': 'Entrar',
  'nav.criarConta': 'Criar conta',
  'nav.sitePublico': 'Site público',
  'nav.painel': 'O meu painel',
  'nav.seguranca': 'Segurança',
  'nav.alterarPassword': 'Alterar palavra-passe',
  'nav.paginaInicial': 'Página inicial',
  'nav.terminarSessao': 'Terminar sessão',
  'nav.novaConsulta': 'Nova consulta',
  'nav.abrirMenu': 'Abrir menu',
  'nav.navegacaoPrincipal': 'Navegação principal',
  'nav.menuLateral': 'Menu lateral',
  'footer.encontrarMedico': 'Encontrar médico',
  'footer.termos': 'Termos',
  'footer.privacidade': 'Privacidade',
  'footer.dadosProtegidos': 'Dados protegidos',
  'footer.clinica': 'Clínica Central',
  'geral.saltarConteudo': 'Saltar para o conteúdo',
  'geral.fechar': 'Fechar',
  'geral.anterior': 'Anterior',
  'geral.seguinte': 'Seguinte',
  'geral.hoje': 'Hoje',
  'geral.dia': 'Dia',
  'geral.semana': 'Semana',
  'geral.mes': 'Mês',
  'tema.ativarEscuro': 'Ativar modo escuro',
  'tema.ativarClaro': 'Ativar modo claro',
  'pwa.offlineTitulo': 'Está sem ligação',
  'pwa.offlineTexto': 'Verifique a ligação à internet e tente novamente. As suas marcações continuam guardadas.',
  'pwa.tentarNovamente': 'Tentar novamente',
};

const dicionarios: Record<Idioma, Dicionario> = {
  'pt-PT': ptPT,
};

/** Normaliza um valor de idioma (ex.: `pt`, `pt-BR`, `en`) para um idioma suportado. */
export function normalizarIdioma(valor: string | undefined | null): Idioma {
  if (!valor) return idiomaPadrao;
  const normalizado = valor.trim().toLowerCase();
  if (normalizado.startsWith('pt')) return 'pt-PT';
  return idiomaPadrao;
}

/** Traduz uma chave com interpolação simples de `{{parametro}}`. */
export function traduzir(
  chave: string,
  idioma: Idioma = idiomaPadrao,
  parametros: Record<string, string | number> = {},
): string {
  const dicionario = dicionarios[idioma] ?? dicionarios[idiomaPadrao];
  const texto = dicionario[chave] ?? dicionarios[idiomaPadrao][chave] ?? chave;
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_todo, nome: string) =>
    Object.prototype.hasOwnProperty.call(parametros, nome) ? String(parametros[nome]) : `{{${nome}}}`,
  );
}

export function dicionarioDe(idioma: Idioma): Readonly<Dicionario> {
  return dicionarios[idioma] ?? dicionarios[idiomaPadrao];
}
