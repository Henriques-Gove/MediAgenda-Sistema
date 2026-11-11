# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove ferramentas de desenvolvimento, mantendo o CLI do Prisma para migrações.
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl \
  && addgroup -S mediagenda \
  && adduser -S mediagenda -G mediagenda

ENV NODE_ENV=production \
    PORT=3101 \
    DATABASE_URL=file:/app/data/mediagenda.db \
    LOG_LEVEL=info

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY views ./views
COPY public ./public

RUN mkdir -p /app/data /app/public/uploads/documentos /app/public/uploads/perfis \
  && chown -R mediagenda:mediagenda /app/data /app/public/uploads

USER mediagenda
EXPOSE 3101

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3101/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
