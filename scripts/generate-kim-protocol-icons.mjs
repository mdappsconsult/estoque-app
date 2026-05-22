/**
 * Gera ícones quadrados do Kim Protocol a partir do logo (trim + preenchimento total).
 * Uso: node scripts/generate-kim-protocol-icons.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'public/branding/acai-do-kim-logo.png');
const outDir = path.join(root, 'public/branding/kim-protocol');

const sizes = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

const BG = { r: 0, g: 0, b: 0, alpha: 1 };

async function buildSquareIcon(size) {
  const trimmed = await sharp(src).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const w = meta.width ?? size;
  const h = meta.height ?? size;
  // Escala o logo ao máximo dentro do quadrado, sem cortar letras.
  const scale = size / Math.max(w, h);
  const innerW = Math.round(w * scale);
  const innerH = Math.round(h * scale);
  const resized = await sharp(trimmed).resize(innerW, innerH, { fit: 'fill' }).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toBuffer();
}

await mkdir(outDir, { recursive: true });

for (const { name, size } of sizes) {
  const buf = await buildSquareIcon(size);
  await sharp(buf).toFile(path.join(outDir, name));
  console.log(`✓ ${name} (${size}×${size})`);
}

console.log(`Ícones em public/branding/kim-protocol/`);
