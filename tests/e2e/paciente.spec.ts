import { expect, test } from '@playwright/test';
import { semCodigosTecnicos, verificarAcessibilidade } from './helpers';

test.describe('área do paciente', () => {
  test('painel mostra o resumo e as próximas consultas', async ({ page }) => {
    await page.goto('/paciente/dashboard');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Ana/i);
    await expect(page.getByText(/pr.ximas consultas/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /marcar nova consulta/i })).toBeVisible();
    await semCodigosTecnicos(page);
    await verificarAcessibilidade(page, 'painel do paciente');
  });

  test('consultas e exportações CSV, PDF e ICS funcionam', async ({ page }) => {
    await page.goto('/paciente/consultas');
    await expect(page.getByRole('heading', { name: /as minhas consultas/i })).toBeVisible();

    const csv = await page.request.get('/paciente/consultas/exportar.csv');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect((await csv.body()).length).toBeGreaterThan(10);

    const pdf = await page.request.get('/paciente/consultas/exportar.pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).length).toBeGreaterThan(1_000);

    const ics = await page.request.get('/paciente/consultas/exportar.ics');
    expect(ics.status()).toBe(200);
    expect(ics.headers()['content-type']).toContain('text/calendar');
    expect(await ics.text()).toContain('BEGIN:VCALENDAR');

    await verificarAcessibilidade(page, 'consultas do paciente');
  });

  test('lista de espera permite inscrever e cancelar um pedido', async ({ page }) => {
    await page.goto('/paciente/lista-espera');
    await expect(page.getByRole('heading', { name: /lista de espera/i })).toBeVisible();

    const medico = await page.locator('#medicoId option').nth(1).getAttribute('value');
    expect(medico).toBeTruthy();
    await page.selectOption('#medicoId', medico!);
    await page.fill('#dataPreferida', new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
    await page.selectOption('#periodo', 'MANHA');
    await page.getByRole('button', { name: /entrar na lista de espera/i }).click();

    await expect(page.locator('.alert-success')).toContainText(/pedido registado/i);

    page.on('dialog', (dialogo) => dialogo.accept());
    await page.locator('form[action*="/lista-espera/"][action*="/cancelar"] button[type="submit"]').first().click();
    await expect(page.locator('.alert-info')).toContainText(/cancelado/i);

    await verificarAcessibilidade(page, 'lista de espera do paciente');
  });

  test('documentos clínicos do paciente estão protegidos', async ({ page }) => {
    await page.goto('/paciente/documentos');
    await expect(page.getByRole('heading', { name: /documentos clínicos/i })).toBeVisible();
    await expect(page.getByText(/confidenciais/i)).toBeVisible();
    await semCodigosTecnicos(page);
    await verificarAcessibilidade(page, 'documentos do paciente');
  });
});
