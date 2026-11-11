-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Utilizador" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "telefone" TEXT,
    "preferenciaNotificacao" TEXT NOT NULL DEFAULT 'EMAIL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "emailConfirmado" BOOLEAN NOT NULL DEFAULT false,
    "tokenConfirmacao" TEXT,
    "tokenRecuperacao" TEXT,
    "tokenRecuperacaoExpira" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMP(3),
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "consentimentoAceiteEm" TIMESTAMP(3),
    "fotoUrl" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Utilizador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paciente" (
    "id" TEXT NOT NULL,
    "utilizadorId" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3) NOT NULL,
    "telefone" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medico" (
    "id" TEXT NOT NULL,
    "utilizadorId" TEXT NOT NULL,
    "numeroRegisto" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "localizacao" TEXT NOT NULL,
    "bio" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "duracaoConsultaMinutos" INTEGER NOT NULL DEFAULT 60,
    "maxConsultasDia" INTEGER NOT NULL DEFAULT 10,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Especialidade" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "duracaoPadraoMinutos" INTEGER NOT NULL DEFAULT 60,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Especialidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicoEspecialidade" (
    "medicoId" TEXT NOT NULL,
    "especialidadeId" TEXT NOT NULL,

    CONSTRAINT "MedicoEspecialidade_pkey" PRIMARY KEY ("medicoId","especialidadeId")
);

-- CreateTable
CREATE TABLE "Disponibilidade" (
    "id" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Disponibilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bloqueio" (
    "id" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consulta" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "especialidadeId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "confirmacaoToken" TEXT,
    "expiraConfirmacaoEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "canceladaPor" TEXT,
    "cancelamentoTardio" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avaliacao" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "estrelas" INTEGER NOT NULL,
    "comentario" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "utilizadorId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "detalhes" TEXT,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT,
    "destinatario" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ENVIADA',
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "Sessao" (
    "sid" TEXT NOT NULL,
    "dados" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "ListaEspera" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "especialidadeId" TEXT,
    "dataPreferida" TIMESTAMP(3),
    "periodo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ATIVA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListaEspera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoClinico" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT,
    "pacienteId" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT,
    "ficheiroNome" TEXT,
    "ficheiroCaminho" TEXT,
    "ficheiroTipo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoClinico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilizador_email_key" ON "Utilizador"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Utilizador_tokenConfirmacao_key" ON "Utilizador"("tokenConfirmacao");

-- CreateIndex
CREATE UNIQUE INDEX "Utilizador_tokenRecuperacao_key" ON "Utilizador"("tokenRecuperacao");

-- CreateIndex
CREATE INDEX "Utilizador_perfil_idx" ON "Utilizador"("perfil");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_utilizadorId_key" ON "Paciente"("utilizadorId");

-- CreateIndex
CREATE UNIQUE INDEX "Medico_utilizadorId_key" ON "Medico"("utilizadorId");

-- CreateIndex
CREATE UNIQUE INDEX "Medico_numeroRegisto_key" ON "Medico"("numeroRegisto");

-- CreateIndex
CREATE INDEX "Medico_ativo_idx" ON "Medico"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Especialidade_nome_key" ON "Especialidade"("nome");

-- CreateIndex
CREATE INDEX "Disponibilidade_medicoId_diaSemana_idx" ON "Disponibilidade"("medicoId", "diaSemana");

-- CreateIndex
CREATE INDEX "Bloqueio_medicoId_inicio_fim_idx" ON "Bloqueio"("medicoId", "inicio", "fim");

-- CreateIndex
CREATE UNIQUE INDEX "Consulta_confirmacaoToken_key" ON "Consulta"("confirmacaoToken");

-- CreateIndex
CREATE INDEX "Consulta_medicoId_inicio_idx" ON "Consulta"("medicoId", "inicio");

-- CreateIndex
CREATE INDEX "Consulta_pacienteId_inicio_idx" ON "Consulta"("pacienteId", "inicio");

-- CreateIndex
CREATE INDEX "Consulta_estado_idx" ON "Consulta"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Avaliacao_consultaId_key" ON "Avaliacao"("consultaId");

-- CreateIndex
CREATE INDEX "Avaliacao_medicoId_idx" ON "Avaliacao"("medicoId");

-- CreateIndex
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");

-- CreateIndex
CREATE INDEX "Auditoria_acao_idx" ON "Auditoria"("acao");

-- CreateIndex
CREATE INDEX "Notificacao_consultaId_idx" ON "Notificacao"("consultaId");

-- CreateIndex
CREATE INDEX "Sessao_expiraEm_idx" ON "Sessao"("expiraEm");

-- CreateIndex
CREATE INDEX "ListaEspera_medicoId_estado_idx" ON "ListaEspera"("medicoId", "estado");

-- CreateIndex
CREATE INDEX "ListaEspera_pacienteId_estado_idx" ON "ListaEspera"("pacienteId", "estado");

-- CreateIndex
CREATE INDEX "DocumentoClinico_pacienteId_criadoEm_idx" ON "DocumentoClinico"("pacienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "DocumentoClinico_medicoId_criadoEm_idx" ON "DocumentoClinico"("medicoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_utilizadorId_fkey" FOREIGN KEY ("utilizadorId") REFERENCES "Utilizador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medico" ADD CONSTRAINT "Medico_utilizadorId_fkey" FOREIGN KEY ("utilizadorId") REFERENCES "Utilizador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicoEspecialidade" ADD CONSTRAINT "MedicoEspecialidade_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicoEspecialidade" ADD CONSTRAINT "MedicoEspecialidade_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "Especialidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disponibilidade" ADD CONSTRAINT "Disponibilidade_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "Especialidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_utilizadorId_fkey" FOREIGN KEY ("utilizadorId") REFERENCES "Utilizador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "Especialidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoClinico" ADD CONSTRAINT "DocumentoClinico_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoClinico" ADD CONSTRAINT "DocumentoClinico_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoClinico" ADD CONSTRAINT "DocumentoClinico_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

