import { expect, test } from '@playwright/test';
import { semCodigosTecnicos, verificarAcessibilidade } from './helpers';

test.describe('site público', () => {
  test('página inicial apresenta a proposta e a navegação', async ({ page }) => {
    await page.goto('/inicio');

    await expect(page).toHaveTitle(/MediAgenda/);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Médicos', exact: true }).first()).toBeVisible();
    await semCodigosTecnicos(page);
    await verificarAcessibilidade(page, 'página inicial');
  });

  test('página de entrada tem formulário acessível', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
    await semCodigosTecnicos(page);
    await verificarAcessibilidade(page, 'entrada');
  });

  test('modo escuro aplica-se e persiste entre páginas', async ({ page }) => {
    await page.goto('/inicio');

    const html = page.locator('html');
    await expect(html).not.toHaveAttribute('data-bs-theme', 'dark');

    await page.locator('[data-toggle-tema]').first().click();
    await expect(html).toHaveAttribute('data-bs-theme', 'dark');

    await page.reload();
    await expect(html).toHaveAttribute('data-bs-theme', 'dark');

    await page.locator('[data-toggle-tema]').first().click();
    await expect(html).not.toHaveAttribute('data-bs-theme', 'dark');
  });

  test('páginas legais e institucionais respondem', async ({ page }) => {
    for (const caminho of ['/sobre', '/termos', '/privacidade']) {
      const resposta = await page.goto(caminho);
      expect(resposta?.status(), caminho).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
      await semCodigosTecnicos(page);
    }
    await verificarAcessibilidade(page, 'página legal');
  });

  test('página offline é apresentada sem ligação', async ({ page }) => {
    await page.goto('/offline');
    await expect(page.getByRole('heading', { name: /sem ligação/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /tentar novamente/i })).toBeVisible();
  });
});
