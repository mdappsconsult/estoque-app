/**
 * Checagens leves no navegador antes de enviar a foto para o servidor (OCR).
 * Não substitui validação no backend.
 */

export type ResultadoQualidadeImagem = { ok: true } | { ok: false; motivo: string };

const MAX_BYTES = 8 * 1024 * 1024;
const MIN_BYTES = 8 * 1024;
const MIN_LADO_PX = 800;

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    img.src = url;
  });
}

/**
 * @param file Arquivo de imagem (JPEG/PNG/WebP).
 */
export async function avaliarQualidadeImagemNota(file: File): Promise<ResultadoQualidadeImagem> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, motivo: 'Selecione um arquivo de imagem (JPEG, PNG ou WebP).' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, motivo: 'Arquivo grande demais (máx. 8 MB). Reduza a resolução ou comprima.' };
  }
  if (file.size < MIN_BYTES) {
    return { ok: false, motivo: 'Arquivo muito pequeno — verifique se a foto foi capturada.' };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await carregarImagem(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const minSide = Math.min(w, h);
    if (minSide < MIN_LADO_PX) {
      return {
        ok: false,
        motivo: `Resolução baixa (${w}×${h} px). Aproxime a câmera ou use modo retrato.`,
      };
    }

    const canvas = document.createElement('canvas');
    const scale = 220 / Math.max(w, h);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: true };

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const avg = sum / n;
    if (avg < 38) {
      return { ok: false, motivo: 'Imagem muito escura — aumente a luz ou use o flash.' };
    }
    if (avg > 248) {
      return { ok: false, motivo: 'Imagem muito clara (reflexo). Afaste o flash ou mude o ângulo.' };
    }

    return { ok: true };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    r.readAsDataURL(file);
  });
}

export function dataUrlToBase64AndMime(dataUrl: string): { base64: string; mimeType: string } | null {
  const t = dataUrl.trim();
  const base64Mark = ';base64,';
  const i = t.indexOf(base64Mark);
  if (!t.startsWith('data:') || i < 0) return null;
  const head = t.slice('data:'.length, i);
  const mimeType = head.split(';')[0]?.trim() || '';
  const base64 = t.slice(i + base64Mark.length);
  if (!mimeType || !base64) return null;
  return { mimeType, base64 };
}
