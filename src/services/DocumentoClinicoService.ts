import fs from 'node:fs';
import path from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '../lib/prisma';
import { ErroNaoEncontrado, ErroValidacao } from '../domain/errors';

export const documentoInclude = {
  medico: { include: { utilizador: true } },
  paciente: { include: { utilizador: true } },
  consulta: true,
} satisfies Prisma.DocumentoClinicoInclude;

export type DocumentoClinicoComRelacoes = Prisma.DocumentoClinicoGetPayload<{
  include: typeof documentoInclude;
}>;

export interface DadosDocumento {
  pacienteId: string;
  consultaId?: string | null;
  tipo: string;
  titulo: string;
  conteudo?: string | null;
  ficheiro?: {
    nome: string;
    caminho: string;
    tipo: string;
  } | null;
}

const TIPOS = new Set(['RECEITA', 'ATESTADO', 'NOTA', 'ANEXO']);

/** Documentos clínicos: receitas, atestados, notas e anexos. */
export class DocumentoClinicoService {
  constructor(private readonly db: PrismaClient = prismaPadrao) {}

  async criar(medicoId: string, dados: DadosDocumento): Promise<DocumentoClinicoComRelacoes> {
    const tipo = dados.tipo?.toUpperCase();
    if (!tipo || !TIPOS.has(tipo)) {
      throw new ErroValidacao('Escolha o tipo de documento.');
    }
    if (!dados.titulo?.trim()) {
      throw new ErroValidacao('Indique um título para o documento.');
    }
    if (!dados.conteudo?.trim() && !dados.ficheiro) {
      throw new ErroValidacao('Escreva o conteúdo ou anexe um ficheiro.');
    }

    const paciente = await this.db.paciente.findUnique({ where: { id: dados.pacienteId } });
    if (!paciente) throw new ErroNaoEncontrado('Paciente não encontrado.');

    if (dados.consultaId) {
      const consulta = await this.db.consulta.findFirst({
        where: {
          id: dados.consultaId,
          pacienteId: dados.pacienteId,
          medicoId,
        },
      });
      if (!consulta) {
        throw new ErroValidacao('A consulta selecionada não pertence a este paciente.');
      }
    }

    return this.db.documentoClinico.create({
      data: {
        pacienteId: dados.pacienteId,
        medicoId,
        consultaId: dados.consultaId || null,
        tipo,
        titulo: dados.titulo.trim(),
        conteudo: dados.conteudo?.trim() || null,
        ficheiroNome: dados.ficheiro?.nome ?? null,
        ficheiroCaminho: dados.ficheiro?.caminho ?? null,
        ficheiroTipo: dados.ficheiro?.tipo ?? null,
      },
      include: documentoInclude,
    });
  }

  async listarPorPaciente(pacienteId: string): Promise<DocumentoClinicoComRelacoes[]> {
    return this.db.documentoClinico.findMany({
      where: { pacienteId },
      include: documentoInclude,
      orderBy: { criadoEm: 'desc' },
      take: 200,
    });
  }

  async listarPorMedico(
    medicoId: string,
    pacienteId?: string,
  ): Promise<DocumentoClinicoComRelacoes[]> {
    return this.db.documentoClinico.findMany({
      where: { medicoId, ...(pacienteId ? { pacienteId } : {}) },
      include: documentoInclude,
      orderBy: { criadoEm: 'desc' },
      take: 200,
    });
  }

  async obter(id: string): Promise<DocumentoClinicoComRelacoes> {
    const documento = await this.db.documentoClinico.findUnique({
      where: { id },
      include: documentoInclude,
    });
    if (!documento) throw new ErroNaoEncontrado('Documento não encontrado.');
    return documento;
  }

  async remover(id: string, medicoId: string): Promise<void> {
    const documento = await this.db.documentoClinico.findFirst({ where: { id, medicoId } });
    if (!documento) throw new ErroNaoEncontrado('Documento não encontrado.');
    await this.db.documentoClinico.delete({ where: { id } });
    if (documento.ficheiroCaminho) {
      fs.rm(documento.ficheiroCaminho, { force: true }, () => undefined);
    }
  }

  /** Resolve o caminho absoluto de um anexo, impedindo saída da pasta de uploads. */
  caminhoAbsoluto(documento: DocumentoClinicoComRelacoes): string | null {
    if (!documento.ficheiroCaminho) return null;
    const pasta = path.resolve(process.cwd(), 'public', 'uploads', 'documentos');
    const alvo = path.resolve(documento.ficheiroCaminho);
    if (!alvo.startsWith(pasta)) return null;
    return alvo;
  }
}
