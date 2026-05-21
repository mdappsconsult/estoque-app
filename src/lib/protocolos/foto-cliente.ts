/**
 * Comprime uma foto de protocolo no navegador antes de enviar à API.
 * Reduz para no máximo 1600px no lado maior e codifica como JPEG q=0.7.
 * Mantém o objeto pequeno o suficiente para POST JSON em base64 sem estourar.
 */
export interface FotoComprimida {
  base64: string;
  mimeType: 'image/jpeg';
  bytes: number;
}

const MAX_LADO = 1600;
const QUALIDADE = 0.7;

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não consegui ler a foto.'));
    img.src = url;
  });
}

export async function comprimirFotoProtocolo(file: File): Promise<FotoComprimida> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione uma imagem (JPG, PNG ou WebP).');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await carregarImagem(url);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) {
      throw new Error('Foto inválida — tente tirar de novo.');
    }
    const escala = Math.min(1, MAX_LADO / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * escala));
    const targetH = Math.max(1, Math.round(h * escala));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não consegui processar a foto.');
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const dataUrl = canvas.toDataURL('image/jpeg', QUALIDADE);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    if (!base64) throw new Error('Falha ao codificar a foto.');
    const bytes = Math.floor((base64.length * 3) / 4);
    return { base64, mimeType: 'image/jpeg', bytes };
  } finally {
    URL.revokeObjectURL(url);
  }
}
