/**
 * Servidor WebSocket no Pi: recebe HTML (mesmo fluxo das etiquetas do app),
 * renderiza PDF via Chromium headless e envia para CUPS (`lp`).
 * Usa `widthMm`/`heightMm` do JSON para `setViewport` (evita etiqueta 60×60 minúscula no canto).
 *
 * Variáveis: PRINT_WS_PORT (default 8765), PRINT_WS_TOKEN (opcional),
 * CHROMIUM_PATH (default /usr/bin/chromium), CUPS_QUEUE (opcional, fila padrão se vazio).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer-core';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PRINT_WS_PORT) || 8765;
const TOKEN = (process.env.PRINT_WS_TOKEN || '').trim();
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const DEFAULT_QUEUE = (process.env.CUPS_QUEUE || '').trim();

function parseMessage(raw) {
  const text = typeof raw === 'string' ? raw : raw.toString();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Converte mm (CSS 96dpi) para pixels inteiros — viewport alinhada à folha evita layout minúsculo no canto. */
function mmToCssPx(mm) {
  return Math.max(64, Math.ceil((Number(mm) * 96) / 25.4));
}

async function htmlToPdf(html, widthMm, heightMm, preferCssPageSize) {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
    ],
  });
  const tmp = path.join(os.tmpdir(), `wsprint-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`);
  try {
    const page = await browser.newPage();
    const wPx = mmToCssPx(widthMm);
    const hPx = mmToCssPx(heightMm);
    /* Largura = folha (evita layout “achatado” em 800px). Altura generosa: várias páginas no mesmo HTML. */
    await page.setViewport({
      width: wPx,
      height: Math.max(hPx, 1200),
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120_000 });
    await page.emulateMediaType('print');
    const baseMargin = { top: '0', right: '0', bottom: '0', left: '0' };
    const pdfOptions = preferCssPageSize
      ? {
          path: tmp,
          printBackground: true,
          margin: baseMargin,
          preferCSSPageSize: true,
        }
      : {
          path: tmp,
          width: `${widthMm}mm`,
          height: `${heightMm}mm`,
          printBackground: true,
          margin: baseMargin,
        };
    await page.pdf(pdfOptions);
    return tmp;
  } finally {
    await browser.close();
  }
}

async function printPdf(pdfPath, jobName, queue) {
  const args = [];
  if (queue) args.push('-d', queue);
  args.push('-o', `job-name=${(jobName || 'ws-print').slice(0, 128)}`, pdfPath);
  await execFileAsync('lp', args);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('pi-print-ws ok\n');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  if (TOKEN) {
    try {
      const u = new URL(req.url || '/', 'http://localhost');
      if (u.searchParams.get('token') !== TOKEN) {
        ws.close(4001, 'unauthorized');
        return;
      }
    } catch {
      ws.close(4001, 'unauthorized');
      return;
    }
  }

  ws.on('message', async (data) => {
    const msg = parseMessage(data);
    if (!msg || msg.type !== 'print' || typeof msg.html !== 'string') {
      ws.send(JSON.stringify({ ok: false, error: 'Esperado JSON: { type: "print", html: string, widthMm?, heightMm?, jobName?, queue? }' }));
      return;
    }
    /* Fallback só se preferCssPageSize=false; com true o PDF segue @page do HTML (60×30, 60×60, etc.) */
    const widthMm = Number(msg.widthMm) > 0 ? Number(msg.widthMm) : 60;
    const heightMm = Number(msg.heightMm) > 0 ? Number(msg.heightMm) : 30;
    const preferCssPageSize = Boolean(msg.preferCssPageSize);
    const queue = typeof msg.queue === 'string' && msg.queue.trim() ? msg.queue.trim() : DEFAULT_QUEUE;

    let pdfPath;
    try {
      pdfPath = await htmlToPdf(msg.html, widthMm, heightMm, preferCssPageSize);
      await printPdf(pdfPath, msg.jobName, queue);
      ws.send(JSON.stringify({ ok: true }));
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      ws.send(JSON.stringify({ ok: false, error: err }));
    } finally {
      if (pdfPath) fs.unlink(pdfPath, () => {});
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`pi-print-ws escutando ws://0.0.0.0:${PORT}${TOKEN ? ' (com token)' : ' (sem token — use só em LAN confiável)'}`);
});
