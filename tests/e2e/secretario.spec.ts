import { expect, test } from '@playwright/test';
import { semCodigosTecnicos, verificarAcessibilidade } from './helpers';

test.describe('área da secretaria', () => {
  test('painel e agendas em três vistas', async ({ page }) => {
    await page.goto('/secretario/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await semCodigosTecnicos(page);

    await page.goto('/secretario/agendas?vista=dia');
    await expect(page.getByRole('heading', { name: /agendas dos m.dicos/i })).toBeVisible();

    await page.goto('/secretario/agendas?vista=semana');
    await expect(page.locator('.card').filter({ hasText: /sem consultas/i }).first()).toBeVisible();

    await page.goto('/secretario/agendas?vista=mes');
    await expect(page.locator('table.agenda-mes')).toBeVisible();
    await verificarAcessibilidade(page, 'agenda mensal da secretaria');
  });

  test('consultas e exportações', async ({ page }) => {
    await page.goto('/secretario/consultas');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const csv = await page.request.get('/secretario/consultas/exportar.csv');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');

    const pdf = await page.request.get('/secretario/consultas/exportar.pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).length).toBeGreaterThan(1_000);

    const ics = await page.request.get('/secretario/consultas/exportar.ics');
    expect(ics.status()).toBe(200);
    expect(ics.headers()['content-type']).toContain('text/calendar');

    await verificarAcessibilidade(page, 'consultas da secretaria');
  });

  test('lista de espera mostra os pedidos e as sugestões', async ({ page }) => {
    await page.goto('/secretario/lista-espera');
    await expect(page.getByRole('heading', { name: /lista de espera/i })).toBeVisible();
    await semCodigosTecnicos(page);
    await verificarAcessibilidade(page, 'lista de espera da secretaria');
  });
});
