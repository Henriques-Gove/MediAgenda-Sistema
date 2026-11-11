import { expect, test } from '@playwright/test';
import { semCodigosTecnicos, verificarAcessibilidade } from './helpers';

test.describe('área do médico', () => {
  test('painel e agenda diária, semanal e mensal', async ({ page }) => {
    await page.goto('/medico/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await semCodigosTecnicos(page);

    await page.goto('/medico/agenda?vista=dia');
    await expect(page.getByRole('heading', { name: /agenda di.ria/i })).toBeVisible();

    await page.goto('/medico/agenda?vista=semana');
    await expect(page.getByRole('heading', { name: /agenda semanal/i })).toBeVisible();
    await expect(page.locator('.card').filter({ hasText: /sem consultas/i }).first()).toBeVisible();

    await page.goto('/medico/agenda?vista=mes');
    await expect(page.getByRole('heading', { name: /agenda mensal/i })).toBeVisible();
    await expect(page.locator('table.agenda-mes')).toBeVisible();

    await verificarAcessibilidade(page, 'agenda mensal do médico');
  });

  test('histórico de consultas e exportações', async ({ page }) => {
    await page.goto('/medico/consultas');
    await expect(page.getByRole('heading', { name: /hist.rico de consultas/i })).toBeVisible();

    const csv = await page.request.get('/medico/consultas/exportar.csv');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect((await csv.body()).length).toBeGreaterThan(10);

    const pdf = await page.request.get('/medico/consultas/exportar.pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).length).toBeGreaterThan(1_000);

    const ics = await page.request.get('/medico/consultas/exportar.ics');
    expect(ics.status()).toBe(200);
    expect(ics.headers()['content-type']).toContain('text/calendar');
    expect(await ics.text()).toContain('BEGIN:VCALENDAR');

    await verificarAcessibilidade(page, 'consultas do médico');
  });

  test('regista um documento clínico e apresenta-o na lista', async ({ page }) => {
    await page.goto('/medico/consultas');

    const linhaAna = page.locator('tr', { hasText: 'Ana Silva' }).first();
    await expect(linhaAna).toBeVisible();
    await linhaAna.locator('a[href*="/historico"]').click();
    await expect(page.getByRole('heading', { name: /Ana Silva/i })).toBeVisible();

    const titulo = `Receita de teste E2E ${Date.now()}`;
    await page.fill('#titulo', titulo);
    await page.fill('#documento-conteudo', 'Conteúdo clínico de teste gerado automaticamente.');
    await page.locator('#ficheiro').setInputFiles({
      name: 'receita-e2e.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
      ),
    });
    await page.getByRole('button', { name: /guardar documento/i }).click();

    await expect(page.locator('.alert-success')).toContainText(/documento clínico registado/i);

    await page.goto('/medico/documentos');
    await expect(page.getByRole('heading', { name: /documentos clínicos/i })).toBeVisible();
    await expect(page.getByText(titulo)).toBeVisible();
    await verificarAcessibilidade(page, 'documentos do médico');
  });
});
