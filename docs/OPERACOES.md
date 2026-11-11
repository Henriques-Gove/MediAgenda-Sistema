# Operações e produção

Este documento reúne os procedimentos para colocar o MediAgenda em produção,
proteger os dados e recuperar o serviço em caso de incidente.

## Variáveis de ambiente

| Variável | Obrigatória em produção | Descrição |
|---|---|---|
| `NODE_ENV` | Sim | Use `production`. |
| `PORT` | Não | Predefinição: `3101`. |
| `APP_URL` | Sim | Endereço público, por exemplo `https://agenda.exemplo.co.mz`. |
| `SESSION_SECRET` | Sim | Segredo longo e aleatório. Nunca reutilize o valor de desenvolvimento. |
| `DATABASE_URL` | Sim | `file:/app/data/mediagenda.db` no contentor ou a connection string PostgreSQL. |
| `COOKIE_SECURE` | Sim (HTTPS) | `true` quando a aplicação está atrás de HTTPS. |
| `SMTP_HOST` / `SMTP_*` | Não | Sem estes valores, os e-mails ficam registados como simulados. |
| `SMS_API_URL` / `SMS_API_KEY` | Não | Sem estes valores, os SMS ficam simulados. |
| `LOG_LEVEL` | Não | `debug`, `info`, `warn` ou `error`. |
| `LOCALE` | Não | Predefinição: `pt-PT`. |

Nunca versione o ficheiro `.env`. Use os segredos do Render, Railway, Docker
Secrets ou do orquestrador escolhido.

## Arranque com Docker

```bash
docker compose up -d --build
docker compose logs -f app
```

O contentor aplica `prisma migrate deploy` no arranque, guarda a base em
`/app/data` e os uploads em `/app/public/uploads`. Ambos estão em volumes.
O endpoint `/health` confirma a aplicação e a base de dados.

## Cópias de segurança

Criar uma cópia (base + uploads + manifesto com SHA-256):

```bash
npm run db:backup
npm run db:backup -- --manter=30
```

Por predefinição são mantidas as 14 cópias mais recentes em `backups/`.
Agende a tarefa diariamente (cron, Windows Task Scheduler ou job do provedor) e
guarde uma cópia fora do servidor. Exemplo de cron:

```cron
15 2 * * * cd /app && npm run db:backup >> /var/log/mediagenda-backup.log 2>&1
```

### Restaurar

1. Pare a aplicação.
2. Execute o restauro com confirmação explícita:

```bash
npm run db:restore -- backups/mediagenda-20261111-020000 --confirmar
```

O script guarda a base atual em `backups/antes-restauro-*`, valida o SHA-256 do
manifesto e verifica a integridade da base restaurada. Os uploads são copiados
por cima dos existentes. No fim, inicie a aplicação e confirme o acesso.

## Migração para PostgreSQL

Os artefactos são gerados sem alterar nenhuma base:

```bash
npm run db:prepare-postgres
```

Isto cria `prisma/postgresql/schema.prisma`, a migração inicial e instruções em
`prisma/postgresql/README.md`. A migração real exige uma connection string,
testes num ambiente de ensaio e uma cópia de segurança prévia. Em PostgreSQL,
os backups passam a ser feitos com `pg_dump`.

## CI/CD

O workflow `.github/workflows/ci.yml` executa:

- verificação de tipos;
- testes unitários e de integração com cobertura;
- build;
- auditoria de dependências;
- testes E2E com Playwright e verificação WCAG AA com axe;
- teste de carga com autocannon.

O workflow `.github/workflows/deploy.yml` aciona o deploy depois de o CI passar.
Configure um destes segredos no repositório:

- `RENDER_DEPLOY_HOOK_URL`
- `RAILWAY_DEPLOY_HOOK_URL`

Sem o segredo, o deploy não é executado e o workflow apenas informa que falta
configuração.

## Testes locais

```bash
npm test                 # unitários e integração
npm run test:coverage    # cobertura
npm run test:e2e         # Playwright + axe (compila primeiro)
npm run test:load        # requer a aplicação a correr
```

Os testes E2E usam uma base isolada (`prisma/e2e.db`) e recriam-na em cada
execução. Nunca usam a base de desenvolvimento.

## Lista de verificação antes de publicar

- [ ] `SESSION_SECRET` aleatório e diferente do valor de demonstração.
- [ ] `APP_URL` com o domínio real e HTTPS ativo.
- [ ] `COOKIE_SECURE=true` e proxy reverso a terminar TLS.
- [ ] Base de dados e uploads em volumes persistentes.
- [ ] `npm run db:backup` agendado e testado com um restauro.
- [ ] SMTP e SMS configurados e testados com uma conta real.
- [ ] Contas de demonstração removidas ou com palavras-passe alteradas.
- [ ] 2FA ativado para administradores e médicos.
- [ ] `/health` monitorizado e alertas de erro configurados.
- [ ] Logs recolhidos pelo provedor (JSON, sem dados clínicos).
- [ ] Migrações Prisma aplicadas com `prisma migrate deploy`.
- [ ] Testes E2E e de carga a passar no ambiente de ensaio.
