import { expect, test } from '@playwright/test';
import { semCodigosTecnicos, verificarAcessibilidade } from './helpers';

test.describe('área de administração', () => {
  test('painel apresenta indicadores e gráficos', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /painel/i })).toBeVisible();
    await expect(page.locator('.tile-grid .tile')).toHaveCount(5);
    await semCodigosTecnicos(page);
    await verificarAcessibilidade(page, 'painel de administração');
  });

  test('relatórios e exportações', async ({ page }) => {
    await page.goto('/admin/relatorios');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const csv = await page.request.get('/admin/relatorios/exportar.csv');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect((await csv.body()).length).toBeGreaterThan(10);

    const pdf = await page.request.get('/admin/relatorios/exportar.pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).length).toBeGreaterThan(1_000);

    await verificarAcessibilidade(page, 'relatórios');
  });

  test('gestão de utilizadores e auditoria', async ({ page }) => {
    await page.goto('/admin/utilizadores');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await semCodigosTecnicos(page);

    await page.goto('/admin/auditoria');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await verificarAcessibilidade(page, 'auditoria');
  });

  test('pesquisa global encontra médicos, especialidades e pacientes', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.locator('#pesquisaGlobal').fill('Ana');
    await page.locator('#pesquisaGlobal').press('Enter');

    await expect(page).toHaveURL(/\/pesquisa\?q=Ana/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/encontre tudo/i);
    await expect(page.getByText(/Ana Silva/).first()).toBeVisible();

    await page.goto('/pesquisa?q=Cardiologia');
    await expect(page.getByText(/Cardiologia/).first()).toBeVisible();

    await semCodigosTecnicos(page);
    await verificarAcessibilidade(page, 'pesquisa');
  });

  test('sistema em direto apresenta eventos, estados e regras', async ({ page }) => {
    await page.goto('/admin/sistema');
    await expect(page.getByRole('heading', { level: 1, name: /sistema em direto/i })).toBeVisible();
    await expect(page.getByText(/o percurso de uma marcação/i)).toBeVisible();
    await expect(page.getByText(/regras verificadas antes de confirmar/i)).toBeVisible();
    await expect(page.locator('.sistema-padrao')).toHaveCount(4);
    await semCodigosTecnicos(page);
    await verificarAcessibilidade(page, 'sistema em direto');
  });
});
