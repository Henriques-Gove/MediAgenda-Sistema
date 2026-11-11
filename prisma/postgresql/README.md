# PostgreSQL

Artefactos gerados por `npm run db:prepare-postgres`. A aplicação continua a
usar SQLite em desenvolvimento; esta pasta prepara a migração futura.

## Antes de migrar

1. Crie uma base PostgreSQL e defina `DATABASE_URL` com a connection string.
2. Faça uma cópia de segurança da base SQLite e dos uploads (`npm run db:backup`).
3. Teste todo o processo num ambiente de ensaio, nunca diretamente em produção.
4. Confirme que os ficheiros em `public/uploads` também serão migrados.

## Aplicar o schema

```bash
npx prisma migrate deploy --schema prisma/postgresql/schema.prisma
npx prisma generate --schema prisma/postgresql/schema.prisma
```

## Migrar os dados

Exporte os dados da SQLite e importe-os para PostgreSQL com uma ferramenta de
ETL ou um script dedicado. Preserve os identificadores (`id`) e as relações.
Depois de importar, execute o seed apenas se a base estiver vazia:

```bash
DATABASE_URL="postgresql://..." npx tsx prisma/seed.ts
```

## Notas

- Os backups passam a ser feitos com `pg_dump`, não com `VACUUM INTO`.
- A aplicação e o cliente Prisma devem ser gerados a partir do schema PostgreSQL.
- Mantenha a migração SQLite enquanto a migração não estiver concluída.
