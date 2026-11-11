import type { Response } from 'express';
import PDFDocument from 'pdfkit';

export interface ColunaCsv {
  chave: string;
  rotulo: string;
}

export interface TabelaPdf {
  titulo: string;
  colunas: Array<{ rotulo: string; largura: number }>;
  linhas: string[][];
}

export interface RelatorioPdf {
  titulo: string;
  subtitulo?: string;
  resumo?: Array<{ rotulo: string; valor: string }>;
  tabelas?: TabelaPdf[];
  notas?: string[];
}

export interface EventoCalendario {
  id: string;
  inicio: Date;
  fim: Date;
  titulo: string;
  descricao?: string;
  localizacao?: string;
}

function escaparCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (/[";\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Gera CSV compatível com Excel em português (separador ponto e vírgula). */
export function gerarCsv(
  linhas: Array<Record<string, unknown>>,
  colunas: ColunaCsv[],
): string {
  const cabecalho = colunas.map((coluna) => escaparCsv(coluna.rotulo)).join(';');
  const corpo = linhas.map((linha) =>
    colunas.map((coluna) => escaparCsv(linha[coluna.chave])).join(';'),
  );
  return `\uFEFF${[cabecalho, ...corpo].join('\r\n')}`;
}

export function enviarCsv(res: Response, nome: string, conteudo: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(conteudo);
}

function formatarDataIcs(data: Date): string {
  return data.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escaparIcs(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function dobrarLinhaIcs(linha: string): string {
  if (linha.length <= 74) return linha;
  const partes: string[] = [];
  let restante = linha;
  partes.push(restante.slice(0, 74));
  restante = restante.slice(74);
  while (restante.length > 0) {
    partes.push(` ${restante.slice(0, 73)}`);
    restante = restante.slice(73);
  }
  return partes.join('\r\n');
}

/** Gera um calendário iCalendar com um evento por consulta. */
export function gerarIcs(eventos: EventoCalendario[], nomeCalendario = 'MediAgenda'): string {
  const agora = formatarDataIcs(new Date());
  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MediAgenda//Consultas//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparIcs(nomeCalendario)}`,
  ];

  for (const evento of eventos) {
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${evento.id}@mediagenda`,
      `DTSTAMP:${agora}`,
      `DTSTART:${formatarDataIcs(evento.inicio)}`,
      `DTEND:${formatarDataIcs(evento.fim)}`,
      dobrarLinhaIcs(`SUMMARY:${escaparIcs(evento.titulo)}`),
      ...(evento.descricao ? [dobrarLinhaIcs(`DESCRIPTION:${escaparIcs(evento.descricao)}`)] : []),
      ...(evento.localizacao ? [dobrarLinhaIcs(`LOCATION:${escaparIcs(evento.localizacao)}`)] : []),
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  linhas.push('END:VCALENDAR');
  return `${linhas.join('\r\n')}\r\n`;
}

export function enviarIcs(res: Response, nome: string, conteudo: string): void {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(conteudo);
}

/** Constrói um PDF simples, com cabeçalho, resumo, tabelas e paginação. */
export function gerarPdf(relatorio: RelatorioPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: relatorio.titulo, Author: 'MediAgenda' },
    });
    const partes: Buffer[] = [];
    let pagina = 1;
    const larguraUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.on('data', (pedaco: Buffer) => partes.push(pedaco));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const rodape = () => {
      // Escrever dentro da margem inferior pode desencadear uma nova página
      // (e, com o evento pageAdded, uma recursão). Neutralizamos a margem
      // enquanto desenhamos o rodapé e repomos a posição do conteúdo.
      const yAnterior = doc.y;
      const margemInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const y = doc.page.height - 28;
      doc.fontSize(8).fillColor('#6b7280');
      doc.text(
        `MediAgenda · gerado em ${new Date().toLocaleString('pt-PT')}`,
        doc.page.margins.left,
        y,
        { width: larguraUtil - 60, align: 'left', lineBreak: false },
      );
      doc.text(`Página ${pagina}`, doc.page.margins.left + larguraUtil - 60, y, {
        width: 60,
        align: 'right',
        lineBreak: false,
      });

      doc.page.margins.bottom = margemInferior;
      doc.fillColor('#111827').font('Helvetica').fontSize(10);
      doc.y = yAnterior;
    };

    doc.on('pageAdded', () => {
      pagina += 1;
      rodape();
    });

    // Cabeçalho
    doc.rect(0, 0, doc.page.width, 70).fill('#0f766e');
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold');
    doc.text('MediAgenda', doc.page.margins.left, 20, { lineBreak: false });
    doc.fontSize(10).font('Helvetica');
    doc.text('Clínica Central', doc.page.margins.left, 45, { lineBreak: false });
    doc.fillColor('#111827').moveDown(2.4);

    doc.fontSize(16).font('Helvetica-Bold').text(relatorio.titulo);
    if (relatorio.subtitulo) {
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica').fillColor('#4b5563').text(relatorio.subtitulo);
      doc.fillColor('#111827');
    }
    doc.moveDown(1);

    if (relatorio.resumo?.length) {
      doc.fontSize(12).font('Helvetica-Bold').text('Resumo');
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica');
      for (const item of relatorio.resumo) {
        doc.text(`${item.rotulo}: ${item.valor}`);
      }
      doc.moveDown(1);
    }

    for (const tabela of relatorio.tabelas ?? []) {
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
      }
      doc.fontSize(12).font('Helvetica-Bold').text(tabela.titulo);
      doc.moveDown(0.4);

      const desenharCabecalho = () => {
        const y = doc.y;
        doc.rect(doc.page.margins.left, y - 2, larguraUtil, 18).fill('#e5f4f1');
        doc.fillColor('#0f766e').fontSize(9).font('Helvetica-Bold');
        let x = doc.page.margins.left + 4;
        for (const coluna of tabela.colunas) {
          doc.text(coluna.rotulo, x, y + 2, {
            width: coluna.largura - 8,
            lineBreak: false,
          });
          x += coluna.largura;
        }
        doc.fillColor('#111827').font('Helvetica').fontSize(9);
        doc.y = y + 20;
      };

      desenharCabecalho();

      for (const linha of tabela.linhas) {
        const alturaLinha = 16;
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          desenharCabecalho();
        }
        const y = doc.y;
        let x = doc.page.margins.left + 4;
        linha.forEach((valor, indice) => {
          const coluna = tabela.colunas[indice];
          if (!coluna) return;
          doc.text(valor, x, y, {
            width: coluna.largura - 8,
            height: alturaLinha,
            ellipsis: true,
            lineBreak: false,
          });
          x += coluna.largura;
        });
        doc
          .moveTo(doc.page.margins.left, y + alturaLinha)
          .lineTo(doc.page.margins.left + larguraUtil, y + alturaLinha)
          .strokeColor('#e5e7eb')
          .lineWidth(0.5)
          .stroke();
        doc.y = y + alturaLinha + 2;
      }

      if (!tabela.linhas.length) {
        doc.fontSize(9).fillColor('#6b7280').text('Sem registos no período selecionado.');
        doc.fillColor('#111827');
      }
      doc.moveDown(1);
    }

    for (const nota of relatorio.notas ?? []) {
      doc.fontSize(8).fillColor('#6b7280').text(nota);
      doc.fillColor('#111827');
    }

    rodape();
    doc.end();
  });
}

export function enviarPdf(res: Response, nome: string, conteudo: Buffer): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(conteudo);
}
