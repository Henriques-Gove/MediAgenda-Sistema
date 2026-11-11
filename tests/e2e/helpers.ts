import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Analisa a página com as regras WCAG 2.0/2.1 níveis A e AA. Em caso de
 * violações, a mensagem identifica a regra e os elementos afetados.
 */
export async function verificarAcessibilidade(page: Page, contexto: string): Promise<void> {
  const resultados = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  if (resultados.violations.length) {
    const detalhe = resultados.violations
      .map((violacao) => {
        const elementos = violacao.nodes
          .slice(0, 5)
          .map((no) => `    - ${no.target.join(' ')}`)
          .join('\n');
        return `  ${violacao.id} (${violacao.impact ?? 'sem impacto'}): ${violacao.help}\n${elementos}`;
      })
      .join('\n');
    expect.soft(resultados.violations, `Violações de acessibilidade em ${contexto}:\n${detalhe}`).toEqual([]);
  }
}

/** Confirma que a interface não expõe códigos internos de requisitos. */
export async function semCodigosTecnicos(page: Page): Promise<void> {
  const texto = await page.locator('body').innerText();
  expect(texto).not.toMatch(/\b(?:RF|RNF|RN)-\d{2}\b/);
}
