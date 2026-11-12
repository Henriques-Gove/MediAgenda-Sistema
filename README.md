# MediAgenda

Sistema web de agendamento de consultas médicas para a clínica **MediAgenda**. O projeto foi construído como um monólito modular em **Node.js + TypeScript + Express + Prisma + PostgreSQL**, com interface web responsiva em **EJS + Bootstrap**, camada de domínio orientada a eventos, testes automatizados (unitários e end-to-end) e implantação preparada para Docker e Render.

> **Nota:** os códigos técnicos dos requisitos (RF/RNF/RN) aparecem apenas em comentários de código e testes internos; a interface do utilizador apresenta tudo em linguagem natural, em português.

---

## 1. Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20.12+ |
| Linguagem | TypeScript 5.9 |
| Framework web | Express 4 |
| ORM / base de dados | Prisma 6 + PostgreSQL 16 (local via Docker, produção no Render/Neon) |
| Autenticação | `express-session` com store persistido em base de dados + `bcryptjs` + RBAC por perfil |
| Segurança | CSRF em todos os formulários, Helmet (CSP com nonce), rate limiting, sessões `httpOnly` |
| Views | EJS + `express-ejs-layouts` |
| Estilos | Bootstrap 5 + Bootstrap Icons (assets locais) + CSS próprio |
| Testes | Vitest + Supertest (unitários/integração) e Playwright (end-to-end) |
| Notificações | Nodemailer (SMTP) + API HTTP de SMS, com simulação local |
| Contentores | Docker + docker-compose |

---

## 2. Como executar

### Pré-requisitos

- Node.js 20.12 ou superior
- npm
- Docker (para a base PostgreSQL local) ou uma base PostgreSQL já acessível

### Instalação

```bash
npm install
```

### Configuração

Copie `.env.example` para `.env`. As variáveis principais são:

```env
NODE_ENV=development
PORT=3101
APP_URL=http://localhost:3101
SESSION_SECRET=mediagenda-segredo-muito-seguro-mudar-em-producao
DATABASE_URL="postgresql://mediagenda:mediagenda@127.0.0.1:5432/mediagenda?schema=public"

# Se SMTP_HOST estiver vazio, os e-mails são simulados.
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="MediAgenda <no-reply@mediagenda.co.mz>"

# Se SMS_API_URL estiver vazio, os SMS são simulados.
SMS_API_URL=
SMS_API_KEY=
SMS_FROM=MediAgenda
```

### Subir a base PostgreSQL

```bash
docker compose up -d db
```

O serviço `db` usa a imagem `postgres:16-alpine` e as credenciais do `.env` (`mediagenda` / `mediagenda` / base `mediagenda`). Se preferir um servico externo, basta trocar `DATABASE_URL` pela connection string do fornecedor (Neon, Supabase, Render).

### Preparar a base de dados e os dados demo

```bash
npm run setup
```

Este comando gera o cliente Prisma (apenas se ainda não existir), sincroniza o schema (`prisma db push`) e carrega os dados de demonstração. O seed é idempotente: correr o comando várias vezes não duplica consultas.

> **Windows:** se aparecer `EPERM ... query_engine-windows.dll.node`, é porque o servidor de desenvolvimento está a correr e mantém a biblioteca do Prisma aberta. Pare o `npm run dev` (Ctrl+C) ou feche a depuração do VS Code e repita. O script já explica isto em vez de mostrar o erro técnico.

Para repetir apenas o seed:

```bash
npm run db:seed
```

Para recriar a base de dados do zero:

```bash
npm run db:reset
```

### Arrancar em desenvolvimento

```bash
npm run dev
```

A aplicação fica disponível em `http://localhost:3101`.

> A porta 3000 pode estar ocupada por outro processo nesta máquina, por isso o `.env` usa a **3101**. Para mudar de porta, altere `PORT` e `APP_URL` no `.env` e reinicie o servidor.

### VS Code (passo a passo)

1. `Ficheiro > Abrir Pasta` e escolha a pasta do projeto.
2. Abra o terminal integrado (`Ctrl` + `` ` ``).
3. Na primeira vez: `npm install` e `npm run setup`.
4. Arranque com `npm run dev` ou prima `F5` e escolha **MediAgenda - Desenvolvimento (tsx)**.
5. Abra `http://localhost:3101` no navegador.

A pasta `.vscode` já inclui:

| Ficheiro | Para que serve |
| --- | --- |
| `launch.json` | Depuração com F5 (desenvolvimento com `tsx` e produção a partir de `dist`) |
| `settings.json` | Formatação ao guardar, ESLint, tabs, codificação UTF-8 |
| `extensions.json` | Extensões recomendadas (Prettier, ESLint, Prisma, Docker) |

Ao abrir o projeto, o VS Code sugere as extensões recomendadas em **Extensões > Recomendadas**.

### Build e execução em produção

```bash
npm run build
npm start
```

### Verificar se o site publicado está atualizado

```bash
npm run deploy:verificar
```

O script consulta `/health` (que expõe o commit publicado pelo Render), compara com o commit local e diz se o site está atualizado. Também confirma que o login já não mostra contas de demonstração. Aceita outro endereço:

```bash
npm run deploy:verificar -- https://o-meu-servico.onrender.com
```

### Docker

```bash
docker compose up --build
```

O `docker-compose.yml` sobe dois servicos: a aplicacao e a base PostgreSQL (`db`), com os dados num volume persistente. O `Dockerfile` compila o TypeScript; o comando de arranque aplica as migracoes, carrega os dados demo se a base estiver vazia e inicia o servidor.

Para parar sem apagar os dados:

```bash
docker compose down
```

Para apagar tambem o volume da base:

```bash
docker compose down -v
```

---

## 3. Contas de demonstração

Todas as contas usam a palavra-passe **`Medi@2026`**.

| Perfil | E-mail |
|---|---|
| Administrador | `admin@mediagenda.co.mz` |
| Secretaria | `secretaria@mediagenda.co.mz` |
| Médico | `medico@mediagenda.co.mz` |
| Paciente | `paciente@mediagenda.co.mz` |

Médicos adicionais do seed:

- `sofia.medico@mediagenda.co.mz`
- `miguel.medico@mediagenda.co.mz`

Pacientes adicionais do seed:

- `joao.paciente@mediagenda.co.mz`
- `maria.paciente@mediagenda.co.mz`

### Interface e experiência

- **Área autenticada:** sidebar fixa em desktop, organizada por perfil e com secções (principal, gestão, análise e sistema); no mobile passa para um menu offcanvas.
- **Autenticação:** login, registo, recuperação e reposição de palavra-passe num painel dividido, com marca à esquerda e formulário compacto à direita.
- **Login simplificado:** mensagem curta, ilustração animada da receção e ligação direta para criar conta (apenas pacientes).
- **Painéis por perfil:** fundo animado, cenas clínicas discretas e atalhos em cartões (tiles) com ícone, título e uma linha de contexto.
- **Detalhes de usabilidade:** toggle de visibilidade da palavra-passe, modo escuro persistente, link "saltar para o conteúdo", favicon próprio, estados ativos com `aria-current` e página offline (service worker).
- **Assets locais:** Bootstrap 5, Bootstrap Icons e respetivas fontes são servidos de `public/vendor`, sem dependência de CDN em runtime.

---

## 4. Criação de contas e perfis

As regras de quem pode criar cada tipo de conta:

| Quem cria | Que contas pode criar | Onde |
|---|---|---|
| **O próprio paciente** | Apenas a sua conta de paciente | `/registo` (registo público) |
| **Secretaria** | Médicos e pacientes | `/secretario/medicos` e `/secretario/pacientes` |
| **Administrador** | Qualquer perfil (paciente, médico, secretaria, administrador) | `/admin/utilizadores` e `/admin/medicos` |

- O registo público destina-se **apenas a pacientes**; os restantes perfis não têm autosserviço.
- As contas de equipa criadas pela secretaria ou pelo administrador são criadas **já confirmadas** e, se a palavra-passe ficar vazia, o sistema gera uma inicial (`Medi@` + 8 caracteres aleatórios) e apresenta-a numa mensagem na própria página, para ser entregue ao utilizador.
- O login da nova secretaria criada, a criação de médicos pela secretaria e a criação de qualquer perfil pelo administrador são cobertos por testes manuais e pela suíte automatizada.

### Funcionalidades principais

- **Agendamento de consultas:** marcação pelo paciente ou pela secretaria através da `AgendamentoFacade`, com validação em cadeia, cálculo de duração e estado inicial pendente com confirmação por link/token.
- **Agenda médica:** disponibilidade semanal, bloqueios/férias, geração de slots livres e agenda diária, semanal e mensal do médico.
- **Cancelamento e reagendamento:** comandos dedicados, regras de antecedência e cancelamento gratuito até 24 horas.
- **Notificações automáticas:** eventos de domínio publicados no `EventBus`; confirmações, lembretes de 24h e 1h, cancelamentos e reagendamentos por e-mail/SMS (simulados por omissão).
- **Histórico e exportações:** listagens e filtros para paciente, médico, secretaria e administrador; exportação em CSV, PDF e ICS das consultas (`/medico`, `/paciente`, `/secretario/consultas/exportar.*`).
- **Painel do médico:** agenda do dia, próximas consultas, estatísticas, gestão de disponibilidade, bloqueios, perfil, documentos clínicos e avaliações recebidas.
- **Gestão de pacientes:** registo público, criação e edição pela secretaria, com credenciais iniciais geradas automaticamente.
- **Gestão de médicos:** criação pela secretaria ou pelo administrador, associação a especialidades, edição de dados e ativação/desativação.
- **Gestão de especialidades:** CRUD pelo administrador, com duração padrão e estado ativo/inativo.
- **Avaliação de consultas:** avaliação de 1 a 5 estrelas e comentário apenas para consultas realizadas, com média por médico.
- **Lista de espera:** inscrição de pacientes, sugestões de slots e notificação automática quando surge disponibilidade.
- **Relatórios e estatísticas:** taxa de ocupação, taxa de cancelamento, consultas por especialidade, consultas por mês, satisfação média por médico e exportação em PDF/CSV (`/admin/relatorios/exportar.*`).
- **Pesquisa e filtros:** pesquisa de médicos por nome/especialidade/localização/avaliação; filtros de consultas, utilizadores, auditoria e notificações.
- **Auditoria:** registo de ações relevantes em `/admin/auditoria`, alimentado por eventos de domínio.

### Regras de negócio (aplicação no código)

| Regra | Onde é aplicada |
|---|---|
| Antecedência mínima de 1 hora | `AntecedenciaHandler` |
| Cancelamento gratuito com 24h; tardio fica registado | `EstadoConfirmada` |
| Limite diário de consultas por médico | `LimiteDiarioHandler` |
| Duração entre 60 e 120 minutos | `SeletorDuracaoConsulta` |
| Unicidade de horário do médico | `ConflitoAgendaHandler` |
| Máximo de consultas futuras por paciente/médico | `LimitePacienteHandler` |
| Confirmação obrigatória com expiração | `EstadoPendente`, `ConsultaService.expirarPendentes` e `LembreteScheduler` |
| Desativação do médico cancela consultas futuras | `MedicoService.desativar` |
| Horário e dias de funcionamento da clínica | `HorarioFuncionamentoHandler` + `ConfiguracaoSistema` |

---

## 5. Arquitetura

O projeto segue uma organização em camadas, com separação entre domínio, aplicação, infraestrutura e apresentação:

```text
src/
  config/          Configuração Singleton e variáveis de ambiente
  domain/          Entidades, enums, erros, State e Chain of Responsibility
  events/          Event Bus, eventos de domínio e handlers (Observer/EDA)
  lib/             Utilitários de data, paginação, exportação, cliente Prisma e store de sessões
  middleware/      Autenticação, RBAC, CSRF, flash messages, rate limiting e tratamento de erros
  patterns/        Adapter, Command, Facade, Factory e Strategy
  repositories/    Porta de agenda implementada com Prisma (DIP)
  routes/          Rotas públicas, paciente, médico, secretaria, admin e API
  services/        Casos de uso e serviços de aplicação
  app.ts           Composição do Express
  container.ts     Injeção de dependências e registo dos observadores
  server.ts        Arranque, scheduler e encerramento graceful
views/             Templates EJS
public/            CSS, favicon, vendor (Bootstrap/Bootstrap Icons) e service worker
prisma/            Schema, migrações PostgreSQL e seed
tests/             Testes unitários, de integração e end-to-end
docs/              Documentação do sistema
```

### Padrões de projeto aplicados

| Padrão | Implementação |
|---|---|
| **Singleton** | `ConfiguracaoSistema` e `EventBus` |
| **State** | `EstadoPendente`, `EstadoConfirmada`, `EstadoRealizada`, `EstadoCancelada` e `EstadoFactory` |
| **Chain of Responsibility** | `CadeiaValidacaoMarcacao` com handlers independentes por regra |
| **Strategy** | `SeletorDuracaoConsulta`, `EstrategiaEmail` e `EstrategiaSMS` |
| **Factory** | `NotificacaoFactory` |
| **Adapter** | `AdapterEmail` e `AdapterSMS` |
| **Facade** | `AgendamentoFacade` |
| **Command** | `CancelarConsultaCommand`, `ConfirmarConsultaCommand` e `RealizarConsultaCommand` |
| **Observer / EDA** | `EventBus` com `NotificacaoHandler`, `AuditoriaHandler` e `RelatorioHandler` |
| **Injeção de dependências** | `Container` em `src/container.ts` |
| **DIP / Ports** | `PortaAgenda` e `PortaAgendaPrisma` |
| **ISP** | Interfaces pequenas `IEnviavelEmail`, `IEnviavelSMS` e `IAgendavel` |

### Fluxo de uma marcação

1. O paciente ou a secretaria submete o formulário.
2. A `AgendamentoFacade` obtém paciente, médico e especialidade.
3. A `CadeiaValidacaoMarcacao` valida antecedência, horário, disponibilidade, conflitos, limite diário e limite por paciente.
4. A Strategy calcula a duração da consulta.
5. O `ConsultaService` grava a consulta como pendente e gera o token de confirmação.
6. O `EventBus` publica o evento de consulta criada.
7. Os handlers registam auditoria, criam a notificação e atualizam o snapshot de relatórios.
8. O paciente confirma através do link/token; o State muda para confirmada e o evento correspondente é publicado.

---

## 6. Testes

```bash
npm test              # testes unitários e de integração
npm run test:e2e      # testes end-to-end com Playwright (inclui build)
npm run test:coverage # com relatório de cobertura
```

A suíte unitária/integração cobre:

- transições do padrão **State**;
- as regras da **Chain of Responsibility**;
- as estratégias de duração e a **Factory** de notificações;
- a orquestração da **Facade**;
- integração HTTP com **Supertest**: páginas públicas, API, login, RBAC, marcação e confirmação de consulta.

A suíte end-to-end (Playwright) percorre o sistema como utilizadores reais: site público, modo escuro, página offline, áreas de paciente, médico, secretaria e administração, exportações e lista de espera. Usa o schema PostgreSQL isolado `e2e` e nunca toca nos dados de desenvolvimento.

Os testes de integração usam o schema `test`, recriado automaticamente antes de cada execução. Ambos precisam da base PostgreSQL a correr:

```bash
docker compose up -d db
npm test
```

> Em CI, o GitHub Actions sobe um serviço `postgres:16` com as mesmas credenciais; não é preciso configurar nada.

---

## 7. API REST

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/health` | Estado do serviço |
| `GET` | `/api/especialidades` | Lista de especialidades |
| `GET` | `/api/medicos` | Pesquisa de médicos com filtros |
| `GET` | `/api/medicos/:id` | Detalhe do médico |
| `GET` | `/api/medicos/:id/slots?data=YYYY-MM-DD` | Slots de agenda |
| `GET` | `/api/consultas/:id` | Detalhe de consulta (requer sessão e autorização) |

---

## 8. Notificações

- **E-mail:** usa Nodemailer quando `SMTP_HOST` está definido. Sem SMTP, o envio é simulado e registado com o estado simulado.
- **SMS:** usa `SMS_API_URL` quando definido. Sem URL, o envio é simulado.
- **Lembretes:** o `LembreteScheduler` corre a cada 60 segundos, cancela confirmações expiradas e publica lembretes de 24h e 1h, com deduplicação por marcadores internos.

O histórico de notificações pode ser consultado em `/admin/notificacoes`.

---

## 9. Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com `tsx watch` |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Executa a versão compilada |
| `npm run setup` | Gera Prisma Client (se necessário), sincroniza o schema e executa o seed |
| `npm run deploy:verificar` | Confirma se o site publicado está a correr o commit mais recente |
| `npm run db:push` | Sincroniza o schema com a base de dados |
| `npm run db:migrate` | Cria/aplica migrações em desenvolvimento |
| `npm run db:seed` | Executa o seed de demonstração |
| `npm run db:reset` | Recria a base de dados e volta a executar o seed |
| `npm run db:backup` | Cria um dump PostgreSQL (`pg_dump`) e copia os uploads |
| `npm run db:restore` | Restaura um dump PostgreSQL (`pg_restore`) |
| `npm test` | Executa os testes uma vez |
| `npm run test:watch` | Executa os testes em modo watch |
| `npm run test:coverage` | Executa os testes com relatório de cobertura |
| `npm run test:e2e` | Executa a suíte end-to-end (Playwright) |

---

## 10. Segurança

- Palavras-passe guardadas com `bcrypt`.
- Sessões com cookies `httpOnly`, `SameSite=Lax` e expiração de 8 horas, persistidas na base de dados (`PrismaSessionStore`).
- Proteção CSRF em todos os formulários, com token por sessão e verificação em todos os pedidos de alteração de estado.
- Helmet com Content Security Policy baseada em nonce e restrição de origens.
- Rate limiting no login, no registo e na recuperação de palavra-passe.
- RBAC por perfil em todas as áreas autenticadas; documentos clínicos visíveis apenas ao médico responsável, ao paciente e à secretaria.
- Registo de auditoria das ações relevantes.

---

## 11. Trabalhos futuros

O âmbito funcional está concluído. Para uma utilização real em produção, recomenda-se:

1. **Configurar SMTP e SMS reais** através das variáveis de ambiente.
2. **Criar a base PostgreSQL de producao** (Neon, Supabase ou Render) e definir `DATABASE_URL` no servico.
3. **Configurar HTTPS** no servidor de implantação (o Render fornece por omissão).
4. **Persistir os uploads** — no plano gratuito do Render o disco e efemero; use um disco pago ou armazenamento externo (S3).
5. **Aumentar a cobertura de testes** com cenários de cancelamento tardio e relatórios.
