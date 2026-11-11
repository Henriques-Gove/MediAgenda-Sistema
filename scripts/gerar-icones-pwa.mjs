import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const pasta = path.resolve(process.cwd(), 'public', 'icons');
mkdirSync(pasta, { recursive: true });

const COR_FUNDO = [15, 118, 110, 255];
const COR_DESTAQUE = [20, 184, 166, 255];
const COR_BRANCO = [255, 255, 255, 255];
const COR_TRANSPARENTE = [0, 0, 0, 0];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dados) {
  const comprimento = Buffer.alloc(4);
  comprimento.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([comprimento, corpo, crc]);
}

function dentroRetanguloArredondado(x, y, esquerda, topo, largura, altura, raio) {
  const direita = esquerda + largura;
  const fundo = topo + altura;
  if (x < esquerda || x >= direita || y < topo || y >= fundo) return false;
  const cx = Math.min(Math.max(x, esquerda + raio), direita - raio);
  const cy = Math.min(Math.max(y, topo + raio), fundo - raio);
  return (x - cx) ** 2 + (y - cy) ** 2 <= raio ** 2;
}

function corDoPonto(x, y, tamanho, maskable) {
  const margem = maskable ? 0 : tamanho * 0.06;
  const raio = maskable ? 0 : tamanho * 0.22;
  const dentroFundo = maskable
    ? true
    : dentroRetanguloArredondado(x, y, margem, margem, tamanho - margem * 2, tamanho - margem * 2, raio);
  if (!dentroFundo) return COR_TRANSPARENTE;

  const escala = maskable ? 0.62 : 0.72;
  const braco = tamanho * escala;
  const espessura = braco * 0.3;
  const centro = tamanho / 2;
  const esquerda = centro - braco / 2;
  const topo = centro - braco / 2;

  const vertical = dentroRetanguloArredondado(
    x,
    y,
    centro - espessura / 2,
    topo,
    espessura,
    braco,
    espessura * 0.35,
  );
  const horizontal = dentroRetanguloArredondado(
    x,
    y,
    esquerda,
    centro - espessura / 2,
    braco,
    espessura,
    espessura * 0.35,
  );
  if (vertical || horizontal) return COR_BRANCO;

  // Faixa diagonal subtil para dar profundidade ao fundo.
  const diagonal = (x + y) / (tamanho * 2);
  if (diagonal < 0.55) {
    return COR_DESTAQUE.map((valor, indice) =>
      Math.round(valor * 0.35 + COR_FUNDO[indice] * 0.65),
    );
  }
  return COR_FUNDO;
}

function gerarPng(tamanho, maskable = false) {
  const linhas = [];
  for (let y = 0; y < tamanho; y += 1) {
    const linha = Buffer.alloc(1 + tamanho * 4);
    linha[0] = 0;
    for (let x = 0; x < tamanho; x += 1) {
      const cor = corDoPonto(x, y, tamanho, maskable);
      const offset = 1 + x * 4;
      linha[offset] = cor[0];
      linha[offset + 1] = cor[1];
      linha[offset + 2] = cor[2];
      linha[offset + 3] = cor[3];
    }
    linhas.push(linha);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ficheiros = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];

for (const [nome, tamanho, maskable] of ficheiros) {
  writeFileSync(path.join(pasta, nome), gerarPng(tamanho, maskable));
  console.log(`Gerado public/icons/${nome}`);
}
