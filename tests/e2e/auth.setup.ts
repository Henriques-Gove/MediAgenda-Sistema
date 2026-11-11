import fs from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';

const contas = [
  {
    nome: 'paciente',
    email: 'paciente@mediagenda.co.mz',
    destino: /\/paciente\/dashboard/,
  },
  {
    nome: 'medico',
    email: 'medico@mediagenda.co.mz',
    destino: /\/medico\/dashboard/,
  },
  {
    nome: 'secretario',
    email: 'secretaria@mediagenda.co.mz',
    destino: /\/secretario\/dashboard/,
  },
  {
    nome: 'admin',
    email: 'admin@mediagenda.co.mz',
    destino: /\/admin\/dashboard/,
  },
];

for (const conta of contas) {
  setup(`autenticar ${conta.nome}`, async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', conta.email);
    await page.fill('#password', 'Medi@2026');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(conta.destino);

    const destino = path.join('tests', 'e2e', '.auth', `${conta.nome}.json`);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    await page.context().storageState({ path: destino });
  });
}
