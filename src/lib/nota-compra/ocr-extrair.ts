/**
 * Extração estruturada de DANFE / nota (imagem). Somente servidor (Route Handlers).
 */

export type LinhaNotaExtraida = {
  descricao: string;
  ean: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
};

export type NotaCompraExtraida = {
  nota_fiscal: string | null;
  fornecedor: string | null;
  linhas: LinhaNotaExtraida[];
};

const JSON_INSTRUCAO = `Você é um extrator de dados de documentos fiscais brasileiros (DANFE, nota de compra).
Analise a imagem e retorne APENAS um JSON válido (sem markdown) com o formato:
{
  "nota_fiscal": "string ou null — número da NF e série se visíveis, ex: 12345-1 ou 12345 SERIE 1",
  "fornecedor": "string ou null — razão social do emitente/fornecedor",
  "linhas": [
    {
      "descricao": "texto do produto como na nota",
      "ean": "string só dígitos do código de barras EAN/GTIN ou null",
      "quantidade": número ou null,
      "valor_unitario": número em reais (use ponto decimal) ou null
    }
  ]
}
Regras: omita linhas de frete/seguro se forem apenas serviços sem produto físico, se claramente identificáveis.
Se não conseguir ler um campo, use null. Não invente números com alta confiança se estiver ilegível — prefira null.`;

/** Tenta isolar o JSON quando o modelo envolve o objeto em texto extra. */
function extrairJsonObjeto(raw: string): string {
  const stripped = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}

function parseJsonExtracao(raw: string): NotaCompraExtraida {
  const cleaned = extrairJsonObjeto(raw);
  const data = JSON.parse(cleaned) as Record<string, unknown>;
  const nota_fiscal =
    typeof data.nota_fiscal === 'string' ? data.nota_fiscal.trim() || null : null;
  const fornecedor =
    typeof data.fornecedor === 'string' ? data.fornecedor.trim() || null : null;
  const linhasRaw = Array.isArray(data.linhas) ? data.linhas : [];
  const linhas: LinhaNotaExtraida[] = [];
  for (const row of linhasRaw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const descricao = typeof r.descricao === 'string' ? r.descricao.trim() : '';
    if (!descricao) continue;
    let ean: string | null = null;
    if (typeof r.ean === 'string' && r.ean.replace(/\D/g, '').length >= 8) {
      ean = r.ean.replace(/\D/g, '');
    } else if (typeof r.ean === 'number') {
      const s = String(r.ean).replace(/\D/g, '');
      ean = s.length >= 8 ? s : null;
    }
    let quantidade: number | null = null;
    if (typeof r.quantidade === 'number' && Number.isFinite(r.quantidade)) quantidade = r.quantidade;
    else if (typeof r.quantidade === 'string') {
      const q = Number.parseFloat(r.quantidade.replace(',', '.'));
      quantidade = Number.isFinite(q) ? q : null;
    }
    let valor_unitario: number | null = null;
    if (typeof r.valor_unitario === 'number' && Number.isFinite(r.valor_unitario)) {
      valor_unitario = r.valor_unitario;
    } else if (typeof r.valor_unitario === 'string') {
      const v = Number.parseFloat(r.valor_unitario.replace(/[^\d,.-]/g, '').replace(',', '.'));
      valor_unitario = Number.isFinite(v) ? v : null;
    }
    linhas.push({ descricao, ean, quantidade, valor_unitario });
  }
  return { nota_fiscal, fornecedor, linhas };
}

export async function extrairNotaCompraComOpenAiVision(
  imageBase64: string,
  mimeType: string
): Promise<NotaCompraExtraida> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error('OPENAI_API_KEY não configurada no servidor.');
  }
  const model = process.env.OPENAI_NOTA_COMPRA_MODEL?.trim() || 'gpt-4o-mini';
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: JSON_INSTRUCAO },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extraia os dados da nota fiscal desta imagem e retorne o JSON conforme instruções.',
            },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI (${res.status}): ${errText.slice(0, 500)}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Resposta vazia do modelo de visão.');
  }
  return parseJsonExtracao(content);
}

function mimeParaAnthropicMediaType(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'image/jpeg';
  if (m === 'image/png') return 'image/png';
  if (m === 'image/webp') return 'image/webp';
  if (m === 'image/gif') return 'image/gif';
  return 'image/jpeg';
}

/**
 * Claude (Anthropic) com visão — Messages API.
 * @see https://docs.anthropic.com/en/api/messages
 */
export async function extrairNotaCompraComAnthropicVision(
  imageBase64: string,
  mimeType: string
): Promise<NotaCompraExtraida> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  }
  const model =
    process.env.ANTHROPIC_NOTA_COMPRA_MODEL?.trim() || 'claude-sonnet-4-6';
  const mediaType = mimeParaAnthropicMediaType(mimeType);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      temperature: 0.1,
      system: JSON_INSTRUCAO,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: 'Extraia os dados da nota fiscal desta imagem e retorne somente o JSON no formato instruído (sem markdown).',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic (${res.status}): ${errText.slice(0, 800)}`);
  }

  const body = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const parts = body.content || [];
  const textBlock = parts.find((b) => b.type === 'text' && typeof b.text === 'string');
  const content = textBlock?.text;
  if (!content || typeof content !== 'string') {
    throw new Error('Resposta vazia do Claude.');
  }
  return parseJsonExtracao(content);
}

/** Para testes de UI sem custo de API. */
export function extrairNotaCompraMock(): NotaCompraExtraida {
  return {
    nota_fiscal: 'MOCK-000',
    fornecedor: 'Fornecedor demonstração (mock)',
    linhas: [
      {
        descricao: 'Açúcar cristal pacote 1kg (exemplo)',
        ean: '7891234567890',
        quantidade: 10,
        valor_unitario: 4.5,
      },
      {
        descricao: 'Produto sem EAN no mock',
        ean: null,
        quantidade: 2,
        valor_unitario: 15.9,
      },
    ],
  };
}

export type ModoOcrNotaCompra = 'mock' | 'openai' | 'anthropic';

/**
 * Provedor de OCR:
 * - `NOTA_COMPRA_OCR_MODE=mock` → dados de demonstração.
 * - `NOTA_COMPRA_OCR_PROVIDER=openai` | `anthropic` | `auto` (padrão **auto**).
 * - Em **auto**: usa Anthropic se `ANTHROPIC_API_KEY` existir; senão OpenAI se `OPENAI_API_KEY`; senão erro orientando as variáveis.
 */
export async function extrairNotaCompraDeImagem(
  imageBase64: string,
  mimeType: string
): Promise<{ extracao: NotaCompraExtraida; modo: ModoOcrNotaCompra }> {
  const mode = process.env.NOTA_COMPRA_OCR_MODE?.trim().toLowerCase();
  if (mode === 'mock') {
    return { extracao: extrairNotaCompraMock(), modo: 'mock' };
  }

  const providerRaw = process.env.NOTA_COMPRA_OCR_PROVIDER?.trim().toLowerCase();
  const provider = providerRaw === 'openai' || providerRaw === 'anthropic' ? providerRaw : 'auto';

  const temAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const temOpenai = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (provider === 'anthropic') {
    const extracao = await extrairNotaCompraComAnthropicVision(imageBase64, mimeType);
    return { extracao, modo: 'anthropic' };
  }
  if (provider === 'openai') {
    const extracao = await extrairNotaCompraComOpenAiVision(imageBase64, mimeType);
    return { extracao, modo: 'openai' };
  }

  // auto: prefere Claude se houver chave Anthropic; senão OpenAI
  if (temAnthropic) {
    const extracao = await extrairNotaCompraComAnthropicVision(imageBase64, mimeType);
    return { extracao, modo: 'anthropic' };
  }
  if (temOpenai) {
    const extracao = await extrairNotaCompraComOpenAiVision(imageBase64, mimeType);
    return { extracao, modo: 'openai' };
  }

  throw new Error(
    'Nenhum provedor de OCR configurado. Defina ANTHROPIC_API_KEY (Claude) ou OPENAI_API_KEY no servidor, ou NOTA_COMPRA_OCR_MODE=mock para testes.'
  );
}
