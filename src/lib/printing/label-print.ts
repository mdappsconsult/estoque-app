import QRCode from 'qrcode';
import { formatarValidadeDdMmAaEtiquetaBr } from '@/lib/datas/validade-producao-br';

export type FormatoEtiqueta = '60x30' | '60x60' | '58x40' | '50x30';

export const FORMATO_IMPRESSAO_STORAGE_KEY = 'etiqueta_formato_padrao';

/**
 * Formato usado em **Separar por Loja** (envio matriz → loja). Não lê `localStorage`.
 */
export const FORMATO_ETIQUETA_FLUXO_OPERACIONAL: FormatoEtiqueta = '60x30';

/**
 * Formato usado na **Produção** (indústria / acabado): etiqueta quadrada 60×60 mm, layout legado completo (validade, lote, etc.).
 * Não lê `localStorage`.
 */
export const FORMATO_ETIQUETA_INDUSTRIA: FormatoEtiqueta = '60x60';

export const FORMATO_CONFIG: Record<
  FormatoEtiqueta,
  {
    label: string;
    widthMm: number;
    heightMm: number;
    paddingMm: number;
    qrSizeMm: number;
    /** Duas etiquetas por folha física (só 60x30). */
    dualPorFolha: boolean;
  }
> = {
  '60x30': {
    label: '60×30 mm',
    widthMm: 60,
    heightMm: 30,
    paddingMm: 0.5,
    /** QR limitado para caber loja+prod+rodapé (Balde nº, Val., Op.) nos ~15×30 mm da meia-etiqueta */
    qrSizeMm: 11.8,
    dualPorFolha: true,
  },
  '60x60': {
    label: '60×60 mm',
    widthMm: 60,
    heightMm: 60,
    paddingMm: 2.5,
    /** Ligeiramente menor que 22 mm para caber faixa meta + tokens + legal sem sobrepor no flex de impressão */
    qrSizeMm: 19,
    dualPorFolha: false,
  },
  '58x40': {
    label: '58×40 mm (legado)',
    widthMm: 58,
    heightMm: 40,
    paddingMm: 2,
    qrSizeMm: 14,
    dualPorFolha: false,
  },
  '50x30': {
    label: '50×30 mm (legado)',
    widthMm: 50,
    heightMm: 30,
    paddingMm: 1.5,
    qrSizeMm: 11.5,
    dualPorFolha: false,
  },
};

export interface EtiquetaParaImpressao {
  id: string;
  produtoNome: string;
  dataManipulacao: string;
  dataValidade: string;
  lote: string;
  tokenQr: string;
  tokenShort: string;
  responsavel: string;
  /** Separar por loja: loja de destino. Produção (60×60): nome do **local** escolhido no formulário (aparece na etiqueta). */
  nomeLoja?: string;
  /** Dia em que a etiqueta foi gerada (ex.: `created_at` ou momento da impressão). ISO. */
  dataGeracaoIso?: string;
  /** Balde indústria → loja: sequência contínua por loja de destino (Separar por Loja). */
  numeroSequenciaLoja?: number | null;
  /** Rastreio 60×60: número sequencial do lançamento de produção (por produto + armazém). */
  loteProducaoNumero?: number | null;
  /** Posição 1..N dentro do lançamento. */
  sequenciaNoLote?: number | null;
  /** N (total de baldes do lançamento). */
  numBaldesLoteProducao?: number | null;
  /** Instante de criação do lançamento (`producoes.created_at`) para exibir «criado dd/mm/aa». */
  dataLoteProducaoIso?: string | null;
}

/**
 * Reordena etiquetas 60×30 para quem junta **todas as metades esquerdas** numa pilha e **todas as direitas** noutra após cortar no pontilhado.
 * Só aplicada quando `preparar60x30PilhasPorLado` / Pi equivalente está ativo (não é o default).
 * Sem isso, folhas 1|2, 3|4 geram pilhas 1,3,5 e 2,4,6; com a preparação, folhas 1|⌈n/2⌉+1, … mantêm sequência numérica em cada pilha.
 */
export function prepararEtiquetas60x30ParaPilhasEsquerdaDireita<T>(etiquetas: T[]): T[] {
  const n = etiquetas.length;
  if (n <= 1) return [...etiquetas];
  const half = Math.ceil(n / 2);
  const out: T[] = [];
  for (let i = 0; i < half; i++) {
    out.push(etiquetas[i]);
    const j = i + half;
    if (j < n) out.push(etiquetas[j]);
  }
  return out;
}

export type OpcoesGerarDocumentoHtmlEtiquetas = {
  /**
   * Quando true, `etiquetas` já passou por {@link prepararEtiquetas60x30ParaPilhasEsquerdaDireita}
   * (ex.: envio Pi fatiou após preparar o lote inteiro).
   */
  preparacao60x30JaAplicada?: boolean;
  /**
   * Só com efeito em 60×30 e quando `preparacao60x30JaAplicada` não está true.
   * `true` = ordem para quem junta só metades esquerdas e só direitas em duas pilhas (pareamento 1|⌈n/2⌉+1…).
   * Default / omitido = pares consecutivos (0|1, 2|3…), adequado à sequência por produto após corte folha a folha.
   */
  preparar60x30PilhasPorLado?: boolean;
};

/** Opções do HTML + texto opcional na faixa fixa da prévia (só texto puro; sem HTML arbitrário). */
export type OpcoesPreviaEtiquetasJanela = OpcoesGerarDocumentoHtmlEtiquetas & {
  mensagemBarra?: string;
};

function normalizarFormatoImpressao(valor: string | null): FormatoEtiqueta {
  if (valor === '60x30' || valor === '60x60' || valor === '58x40' || valor === '50x30') {
    return valor;
  }
  return '60x60';
}

function escaparHtml(valor: string): string {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatarDataPtBr(dataIso: string): string {
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleDateString('pt-BR');
}

/** Validade na etiqueta 60×60 indústria: dd/mm/aa (prefixo YYYY-MM-DD = dia civil, sem deslocar por UTC). */
function formatarValidadeEtiquetaIndustria(dataIso: string): string {
  return formatarValidadeDdMmAaEtiquetaBr(dataIso);
}

function extrairVolumeProduto(nome: string): string {
  const match = nome.match(/(\d+\s?L)\b/i);
  return match ? match[1].replace(/\s+/g, '').toUpperCase() : '';
}

/** Linha «Lote prod. N · k/N · criado dd/mm/aa» na 60×60 indústria (não exibe lote SEP). */
function formatarRastreioLoteProducao6060(item: EtiquetaParaImpressao): string | null {
  const n = item.loteProducaoNumero;
  if (n == null || !Number.isFinite(Number(n))) return null;
  const k = item.sequenciaNoLote;
  const tot = item.numBaldesLoteProducao;
  const frac =
    k != null &&
    tot != null &&
    Number.isFinite(Number(k)) &&
    Number.isFinite(Number(tot)) &&
    Number(tot) > 0
      ? `${k}/${tot}`
      : null;
  const rawIso = (item.dataLoteProducaoIso || '').trim();
  let dataPt = '';
  if (rawIso) {
    const d = new Date(rawIso);
    if (!Number.isNaN(d.getTime())) {
      dataPt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    }
  }
  const partes = [`Lote prod. ${n}`];
  if (frac) partes.push(frac);
  if (dataPt) partes.push(`criado ${dataPt}`);
  return partes.join(' · ');
}

/**
 * Texto curto do lançamento de produção + posição do balde (k/N), para exibir **junto à validade**
 * (60×30 SEP e bloco Validade na 60×60). Ex.: «Lote 893 · 1/70» ou «Lote 1/70» sem número de lote.
 */
function textoLoteBaldeProducaoAcopladoValidade(item: EtiquetaParaImpressao): string | null {
  const k = item.sequenciaNoLote;
  const tot = item.numBaldesLoteProducao;
  if (
    k == null ||
    tot == null ||
    !Number.isFinite(Number(k)) ||
    !Number.isFinite(Number(tot)) ||
    Number(tot) <= 0
  ) {
    return null;
  }
  const frac = `${k}/${tot}`;
  const n = item.loteProducaoNumero;
  if (n != null && Number.isFinite(Number(n))) {
    return `Lote ${n} · ${frac}`;
  }
  return `Lote ${frac}`;
}

/**
 * Pixels da imagem do QR (fonte) maiores que o mínimo teórico em 203 dpi.
 * O CSS limita o tamanho físico em mm; bitmap pequeno (~80px) vira “borrão” na térmica após raster do SO/driver.
 */
function pixelsQrParaImpressao(qrSizeMm: number): number {
  return Math.max(256, Math.round(qrSizeMm * 24));
}

/** QR gerado no próprio browser (sem api.qrserver.com) — mais confiável em produção e para térmica. */
async function qrTokenParaDataUrl(token: string, qrSizeMm: number): Promise<string> {
  const raw = (token || '').trim() || '—';
  const px = Math.max(pixelsQrParaImpressao(qrSizeMm), 180);
  return QRCode.toDataURL(raw, {
    width: px,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/** Centenas de `toDataURL` em um único `Promise.all` estouram memória no celular/notebook. */
async function qrTokensParaDataUrlsEmLotes(
  tokens: string[],
  qrSizeMm: number,
  paralelo = 28
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += paralelo) {
    const slice = tokens.slice(i, i + paralelo);
    const part = await Promise.all(slice.map((t) => qrTokenParaDataUrl(t, qrSizeMm)));
    out.push(...part);
  }
  return out;
}

/** Uma metade da folha 60×30: loja, produto, QR, validade (ou data de impressão) e operador. */
function gerarCelula60x30(
  item: EtiquetaParaImpressao,
  qrSizeMm: number,
  classeExtra: string,
  qrDataUrl: string
): string {
  const loja = escaparHtml((item.nomeLoja || '—').trim() || '—');
  const produto = escaparHtml((item.produtoNome || 'Produto').toUpperCase().slice(0, 32));
  const tokenCurto = escaparHtml((item.tokenShort || item.id.slice(0, 8).toUpperCase()).trim());
  const qrPx = pixelsQrParaImpressao(qrSizeMm);

  const rawValYmd = (item.dataValidade || '').trim().slice(0, 10);
  const valFmt = formatarValidadeEtiquetaIndustria(item.dataValidade || '');
  const temValidade =
    Boolean(rawValYmd) && !rawValYmd.startsWith('2999') && valFmt !== '-';
  const linhaValOuImp = temValidade
    ? `Val. ${valFmt}`
    : `Imp. ${formatarDataPtBr(item.dataGeracaoIso || item.dataManipulacao)}`;
  const loteProducaoValidade = textoLoteBaldeProducaoAcopladoValidade(item);
  const opRaw = (item.responsavel || '').trim();
  const opCurto = opRaw.length > 18 ? `${opRaw.slice(0, 16)}…` : opRaw;
  const linhaOp = opCurto ? `Op. ${opCurto}` : '';
  const nSeq = item.numeroSequenciaLoja;
  const temBalde = nSeq != null && Number.isFinite(Number(nSeq));
  const linhaBaldeRodape = temBalde
    ? `<div class="cel-n-balde">BALDE Nº ${escaparHtml(String(nSeq))}</div>`
    : '';

  return `
    <div class="celula-60x30${classeExtra}">
      <div class="celula-60x30-stack">
        <div class="cel-loja">${loja}</div>
        <div class="cel-prod">${produto}</div>
        <img class="cel-qr" src="${qrDataUrl}" alt="" width="${qrPx}" height="${qrPx}" />
        <div class="cel-code">${tokenCurto}</div>
        <div class="cel-footer">
          ${linhaBaldeRodape}
          <div class="cel-val-block">
            <div class="cel-val">${escaparHtml(linhaValOuImp)}</div>
            ${
              loteProducaoValidade
                ? `<div class="cel-lote-prod-validade">${escaparHtml(loteProducaoValidade)}</div>`
                : ''
            }
          </div>
          ${linhaOp ? `<div class="cel-op">${escaparHtml(linhaOp)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function gerarFolha60x30Par(
  esquerda: EtiquetaParaImpressao,
  direita: EtiquetaParaImpressao | null,
  qrSizeMm: number,
  qrDataUrlEsq: string,
  qrDataUrlDir: string | null
): string {
  const celEsq = gerarCelula60x30(esquerda, qrSizeMm, '', qrDataUrlEsq);
  const celDir = direita
    ? gerarCelula60x30(direita, qrSizeMm, ' celula-direita-pontilhada', qrDataUrlDir!)
    : `<div class="celula-60x30 celula-vazia celula-direita-pontilhada"><span class="cel-vazia-txt">—</span></div>`;
  return `<div class="folha-60x30">${celEsq}${celDir}</div>`;
}

/**
 * 60×60 indústria: ordem de leitura de cima para baixo — produto/loja/balde → validade + QR → tokens/lote
 * (curto) → rodapé legal. Evita bloco legal no topo e loja duplicada ao lado do QR.
 */
function gerarHtmlEtiquetaIndustria6060(item: EtiquetaParaImpressao, qrDataUrl: string): string {
  const qrMm = FORMATO_CONFIG['60x60'].qrSizeMm;
  const qrPx = pixelsQrParaImpressao(qrMm);
  const produtoNome = escaparHtml(item.produtoNome || 'BALDE ACAI').toUpperCase();
  const volume = escaparHtml(extrairVolumeProduto(item.produtoNome));
  const rastreioProducao = formatarRastreioLoteProducao6060(item);
  const blocoRastreioProducao = rastreioProducao
    ? `<div class="e6060-lote-prod">${escaparHtml(rastreioProducao)}</div>`
    : '';
  const loteProducaoValidade = textoLoteBaldeProducaoAcopladoValidade(item);
  const responsavel = escaparHtml((item.responsavel || '—').trim() || '—');
  const tokenShort = escaparHtml(item.tokenShort || item.id.slice(0, 8).toUpperCase());
  const tokenQr = escaparHtml(item.tokenQr);
  const validade = escaparHtml(formatarValidadeEtiquetaIndustria(item.dataValidade));
  const nomeLocalOuLoja = escaparHtml((item.nomeLoja || '—').trim() || '—');
  const nBalde = item.numeroSequenciaLoja;
  const faixaBaldeTopo6060 =
    nBalde != null && Number.isFinite(Number(nBalde))
      ? `<div class="e6060-num-balde">BALDE Nº ${escaparHtml(String(nBalde))}</div>`
      : '';

  return `
    <div class="etiqueta fmt-6060">
      <div class="e6060-head">
        <div class="e6060-produto">${produtoNome}</div>
        <div class="e6060-loja">${nomeLocalOuLoja}</div>
        ${faixaBaldeTopo6060}
        <div class="e6060-resf">
          <span>RESFRIADO</span>
          <span>${volume || '&nbsp;'}</span>
        </div>
      </div>
      <div class="e6060-rule"></div>
      <div class="e6060-mid">
        <div class="e6060-meta-row">
          <div class="e6060-meta-block">
            <span class="e6060-ql">Validade</span>
            <div class="e6060-validade-lote-stack">
              <span class="e6060-qv e6060-qv-val">${validade}</span>
              ${
                loteProducaoValidade
                  ? `<span class="e6060-qv-lote-validade">${escaparHtml(loteProducaoValidade)}</span>`
                  : ''
              }
            </div>
          </div>
          <div class="e6060-meta-block e6060-meta-block-gerou">
            <span class="e6060-ql">Gerou</span>
            <span class="e6060-qv">${responsavel}</span>
          </div>
        </div>
        <div class="e6060-qr-wrap">
          <img class="qr qr-6060" src="${qrDataUrl}" alt="" width="${qrPx}" height="${qrPx}" />
        </div>
      </div>
      <div class="e6060-ids">
        <div class="e6060-tok">${tokenShort}</div>
        <div class="e6060-tokqr">${tokenQr}</div>
        ${blocoRastreioProducao}
      </div>
      <div class="e6060-spacer" aria-hidden="true"></div>
      <div class="e6060-legal">
        <div class="e6060-emp">ACAI DO KIM - CENTRAL DE PRODUCAO</div>
        <div class="e6060-emp">CNPJ: 24.880.097/0001-02</div>
        <div class="e6060-emp">CEP: 47804-000 AVENIDA JK</div>
        <div class="e6060-emp">821, LUIS EDUARDO MAGALHAES, BA</div>
      </div>
    </div>
  `;
}

function gerarHtmlEtiquetaLegado(
  item: EtiquetaParaImpressao,
  formato: Exclude<FormatoEtiqueta, '60x30'>,
  qrDataUrl: string
): string {
  if (formato === '60x60') {
    return gerarHtmlEtiquetaIndustria6060(item, qrDataUrl);
  }

  const fmtClass = `fmt-${formato.replace(/x/g, '')}`;
  const produtoNome = escaparHtml(item.produtoNome || 'BALDE ACAI').toUpperCase();
  const volume = escaparHtml(extrairVolumeProduto(item.produtoNome));
  const lote = escaparHtml(item.lote || '-');
  const responsavel = escaparHtml(item.responsavel || '-');
  const tokenShort = escaparHtml(item.tokenShort || item.id.slice(0, 8).toUpperCase());
  const tokenQr = escaparHtml(item.tokenQr);
  const manipulacao = escaparHtml(formatarDataPtBr(item.dataManipulacao));
  const validade = escaparHtml(formatarDataPtBr(item.dataValidade));
  const nomeLocalOuLoja = escaparHtml((item.nomeLoja || '—').trim() || '—');

  return `
    <div class="etiqueta ${fmtClass}">
      <div class="topo">
        <div class="produto">${produtoNome}</div>
        <div class="nome-loja-local">${nomeLocalOuLoja}</div>
        <div class="sub-linha">
          <span>RESFRIADO</span>
          <span>${volume || '&nbsp;'}</span>
        </div>
        <div class="linha"></div>
      </div>

      <div class="datas">
        <div class="data-row"><span class="label">MANIPULACAO:</span><span class="valor">${manipulacao}</span></div>
        <div class="data-row data-row-validade">
          <span class="label">VALIDADE:</span><span class="valor valor-validade">${validade}</span>
        </div>
      </div>

      <div class="linha"></div>

      <div class="rodape">
        <div class="rodape-left">
          <div class="resp">RESP.: ${responsavel}</div>
          <div class="empresa">ACAI DO KIM - CENTRAL DE PRODUCAO</div>
          <div class="empresa">CNPJ: 24.880.097/0001-02</div>
          <div class="empresa">CEP: 47804-000 AVENIDA JK</div>
          <div class="empresa">821, LUIS EDUARDO MAGALHAES, BA</div>
          <div class="token">${tokenShort}</div>
          <div class="token-qr">${tokenQr}</div>
          <div class="lote">LOTE: ${lote}</div>
        </div>
        <div class="bloco-qr">
          <img class="qr" src="${qrDataUrl}" alt="" width="512" height="512" />
        </div>
      </div>
    </div>
  `;
}

export function obterFormatoImpressaoPadrao(): FormatoEtiqueta {
  if (typeof window === 'undefined') return '60x60';
  return normalizarFormatoImpressao(window.localStorage.getItem(FORMATO_IMPRESSAO_STORAGE_KEY));
}

/**
 * Dados fictícios para teste físico na impressora (não grava no banco).
 * 60×30: duas metades na mesma folha; demais formatos: uma etiqueta por folha.
 */
export function gerarEtiquetasDemonstracaoImpressao(formato: FormatoEtiqueta): EtiquetaParaImpressao[] {
  const agora = new Date().toISOString();
  const mk = (
    idSuffix: string,
    produtoNome: string,
    tokenShort: string,
    numeroBalde?: number | null
  ): EtiquetaParaImpressao => ({
    id: `00000000-0000-4000-8000-${idSuffix}`,
    produtoNome,
    dataManipulacao: agora,
    dataValidade: agora,
    lote: 'TESTE-IMPRESSAO',
    tokenQr: `TESTE-IMPRESSAO-${idSuffix}`,
    tokenShort,
    responsavel: 'Teste impressora',
    nomeLoja: 'Loja exemplo (teste)',
    dataGeracaoIso: agora,
    numeroSequenciaLoja: numeroBalde ?? null,
  });

  if (formato === '60x30') {
    return [
      {
        ...mk('000000000001', 'AÇAÍ BALDE 5L FRUTAS VERMELHAS', 'ACA5L-T1', 12),
        loteProducaoNumero: 40,
        sequenciaNoLote: 1,
        numBaldesLoteProducao: 70,
        dataLoteProducaoIso: agora,
      },
      {
        ...mk('000000000002', 'AÇAÍ BALDE 5L FRUTAS VERMELHAS', 'ACA5L-T2', 13),
        loteProducaoNumero: 40,
        sequenciaNoLote: 2,
        numBaldesLoteProducao: 70,
        dataLoteProducaoIso: agora,
      },
    ];
  }
  return [
    {
      ...mk('000000000099', 'AÇAÍ BALDE 11L TESTE IMPRESSORA', 'TESTE-99', 7),
      loteProducaoNumero: 40,
      sequenciaNoLote: 3,
      numBaldesLoteProducao: 130,
      dataLoteProducaoIso: agora,
    },
  ];
}

export function confirmarImpressao(totalEtiquetas: number, formato?: FormatoEtiqueta): boolean {
  if (typeof window === 'undefined') return false;
  if (formato === '60x30') {
    const folhas = Math.ceil(totalEtiquetas / 2);
    return window.confirm(
      `Imprimir ${totalEtiquetas} etiqueta(s) em ${folhas} folha(s) física(s) 60×30 mm (2 QR por folha, recorte no pontilhado)?\n\nOrdem: produtos com mais unidades nesta impressão primeiro; os de pouca quantidade vão ao final. Ao cortar, junte as metades de um mesmo lado da folha — primeira «coluna» = primeira metade dessa lista; a outra = restante.`
    );
  }
  if (formato === '60x60') {
    return window.confirm(
      `Imprimir ${totalEtiquetas} etiqueta(s) em ${totalEtiquetas} folha(s) física(s) 60×60 mm (indústria / Zebra)?`
    );
  }
  return window.confirm(`Deseja realmente imprimir ${totalEtiquetas} etiqueta(s)?`);
}

function estilosGlobais60x30(cfg: (typeof FORMATO_CONFIG)['60x30']): string {
  const qr = cfg.qrSizeMm;
  const meiaLargura = cfg.widthMm / 2;
  return `
    @page { size: ${cfg.widthMm}mm ${cfg.heightMm}mm; margin: 0; }
    /* table + table-cell: drivers térmicos (Zebra via spooler) costumam errar flex/% — conteúdo ia parar num canto */
    .folha-60x30 {
      box-sizing: border-box;
      display: table;
      width: ${cfg.widthMm}mm;
      height: ${cfg.heightMm}mm;
      table-layout: fixed;
      border-collapse: collapse;
      overflow: hidden;
    }
    /* stack flex: topo da célula + padding-top grande desce loja+prod+QR+juntos; data com auto no espaço restante; conteúdo um pouco menor para não estourar */
    .celula-60x30 {
      box-sizing: border-box;
      display: table-cell;
      width: ${meiaLargura}mm;
      height: ${cfg.heightMm}mm;
      vertical-align: top;
      text-align: center;
      padding: 0.95mm 0.45mm 0.4mm 0.45mm;
    }
    .celula-60x30.celula-vazia {
      vertical-align: middle;
    }
    .celula-60x30-stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      min-height: 0;
    }
    .celula-direita-pontilhada {
      border-left: 0.4mm dashed #111;
      padding-left: 0.7mm;
    }
    .cel-vazia-txt {
      font-size: 8pt;
      color: #bbb;
    }
    .cel-loja {
      font-size: 5.65pt;
      font-weight: 800;
      line-height: 1.02;
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin: 0 0 0.2mm 0;
      flex-shrink: 0;
    }
    .cel-prod {
      font-size: 4.85pt;
      font-weight: 800;
      line-height: 1.05;
      text-align: center;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      height: 3.35mm;
      min-height: 3.35mm;
      max-height: 3.35mm;
      margin: 0.1mm auto 0;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      -webkit-box-pack: start;
      flex-shrink: 0;
    }
    .cel-qr {
      display: block;
      width: ${qr}mm;
      height: ${qr}mm;
      max-width: ${qr}mm;
      object-fit: contain;
      margin: 0.15mm auto 0;
      flex-shrink: 0;
    }
    .cel-code {
      margin: 0.1mm auto 0;
      font-size: 5.2pt;
      font-weight: 900;
      letter-spacing: 0.08em;
      line-height: 1;
      text-align: center;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .cel-footer {
      margin: auto 0 0;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 0.06mm;
      width: 100%;
      max-width: 100%;
      padding: 0 0.1mm;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cel-n-balde {
      font-size: 6.4pt;
      font-weight: 900;
      letter-spacing: 0.04em;
      line-height: 1;
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin: 0.08mm 0 0 0;
    }
    .cel-val-block {
      width: 100%;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.12mm;
    }
    .cel-val {
      font-size: 4.65pt;
      font-weight: 800;
      color: #000;
      letter-spacing: 0.01em;
      line-height: 1.02;
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cel-lote-prod-validade {
      font-size: 4.2pt;
      font-weight: 900;
      color: #000;
      letter-spacing: 0.02em;
      line-height: 1.08;
      text-align: center;
      max-width: 100%;
      white-space: normal;
      word-break: break-word;
    }
    .cel-op {
      font-size: 4.35pt;
      font-weight: 700;
      color: #000;
      line-height: 1.02;
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
}

function estilosGlobaisLegado(formato: Exclude<FormatoEtiqueta, '60x30'>): string {
  const cfg = FORMATO_CONFIG[formato];
  return `
    @page { size: ${cfg.widthMm}mm ${cfg.heightMm}mm; margin: 0; }
    .etiqueta {
      box-sizing: border-box;
      width: ${cfg.widthMm}mm;
      height: ${cfg.heightMm}mm;
      padding: ${cfg.paddingMm}mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .topo .produto {
      font-size: 11pt;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.3px;
      min-height: 4.5mm;
    }
    .nome-loja-local {
      margin-top: 0.45mm;
      font-size: 7pt;
      font-weight: 800;
      line-height: 1.08;
      text-align: center;
      max-height: 4.8mm;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .etiqueta.fmt-6060 {
      justify-content: flex-start;
      gap: 0.3mm;
      min-height: 100%;
    }
    .e6060-head {
      flex-shrink: 0;
      text-align: center;
      width: 100%;
    }
    .e6060-produto {
      font-size: 10pt;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.3px;
      min-height: 3.8mm;
    }
    .e6060-loja {
      margin-top: 0.3mm;
      font-size: 7.6pt;
      font-weight: 800;
      line-height: 1.08;
      max-height: 5mm;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .e6060-num-balde {
      margin-top: 0.25mm;
      font-size: 9.5pt;
      font-weight: 900;
      letter-spacing: 0.07em;
      text-align: center;
      line-height: 1;
      flex-shrink: 0;
    }
    .e6060-resf {
      margin-top: 0.35mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5pt;
      font-weight: 700;
    }
    .e6060-rule {
      flex-shrink: 0;
      margin-top: 0.5mm;
      border-top: 0.45mm solid #000;
      width: 100%;
    }
    /* Coluna fixa: meta em linha + QR central — sem flex:1 (evita QR sobrepor tokens/legal em drivers térmicos) */
    .e6060-mid {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.65mm;
      width: 100%;
    }
    .e6060-meta-row {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2mm;
      width: 100%;
    }
    .e6060-meta-block {
      display: flex;
      flex-direction: column;
      gap: 0.12mm;
      min-width: 0;
    }
    .e6060-meta-block:first-child {
      align-items: flex-start;
      text-align: left;
    }
    .e6060-meta-block-gerou {
      align-items: flex-end;
      text-align: right;
      max-width: 28mm;
    }
    .e6060-ql {
      font-size: 4.8pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      line-height: 1;
    }
    .e6060-qv {
      font-size: 6.2pt;
      font-weight: 700;
      line-height: 1.08;
      word-break: break-word;
      max-width: 26mm;
    }
    .e6060-qv-val {
      font-size: 9.5pt;
      font-weight: 900;
      letter-spacing: 0.02em;
      line-height: 1.05;
    }
    .e6060-validade-lote-stack {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.15mm;
      min-width: 0;
      max-width: 26mm;
    }
    .e6060-qv-lote-validade {
      font-size: 6.4pt;
      font-weight: 900;
      letter-spacing: 0.03em;
      line-height: 1.06;
      color: #111;
      word-break: break-word;
    }
    .e6060-qr-wrap {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* Raster mais «seco» ao reduzir bitmap → mm (Chromium/CUPS → Zebra) */
    .fmt-6060 .qr-6060 {
      image-rendering: pixelated;
    }
    .e6060-ids {
      flex: 0 0 auto;
      width: 100%;
      text-align: left;
    }
    .e6060-spacer {
      flex: 1 1 auto;
      min-height: 0.4mm;
    }
    .e6060-tok {
      margin-top: 0.35mm;
      font-size: 8pt;
      font-weight: 900;
      letter-spacing: 0.8px;
    }
    .e6060-tokqr {
      margin-top: 0.25mm;
      font-size: 4.7pt;
      color: #333;
      line-height: 1.05;
      max-height: 3.2mm;
      overflow: hidden;
      word-break: break-all;
    }
    .e6060-lote {
      margin-top: 0.25mm;
      font-size: 5pt;
      font-weight: 700;
      color: #222;
    }
    .e6060-lote-prod {
      margin-top: 0.35mm;
      font-size: 4.9pt;
      font-weight: 800;
      color: #111;
      line-height: 1.08;
      max-width: 58mm;
      word-break: break-word;
    }
    .e6060-legal {
      flex: 0 0 auto;
      width: 100%;
      padding-top: 0.2mm;
    }
    .e6060-emp {
      font-size: 4.8pt;
      line-height: 1.12;
      font-weight: 700;
      letter-spacing: 0.1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .fmt-5840 .nome-loja-local,
    .fmt-5030 .nome-loja-local {
      font-size: 6pt;
      max-height: 3.6mm;
      -webkit-line-clamp: 1;
    }
    .sub-linha {
      margin-top: 0.55mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8pt;
      font-weight: 700;
    }
    .linha {
      margin-top: 1.1mm;
      border-top: 0.45mm solid #000;
    }
    .datas {
      margin-top: 0.8mm;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1.1mm;
    }
    .data-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .data-row .label { font-size: 9pt; font-weight: 800; }
    .data-row .valor { font-size: 9pt; font-weight: 700; }
    .rodape {
      margin-top: 1mm;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 1.5mm;
    }
    .rodape-left { min-width: 0; flex: 1; }
    .resp { font-size: 7.8pt; font-weight: 800; line-height: 1.1; margin-bottom: 0.45mm; }
    .empresa {
      font-size: 5.2pt;
      line-height: 1.12;
      font-weight: 700;
      letter-spacing: 0.1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .token { margin-top: 0.6mm; font-size: 8pt; font-weight: 900; letter-spacing: 0.8px; }
    .token-qr {
      margin-top: 0.35mm;
      font-size: 4.7pt;
      color: #333;
      line-height: 1.05;
      max-height: 3.2mm;
      overflow: hidden;
      word-break: break-all;
    }
    .lote { margin-top: 0.35mm; font-size: 5pt; font-weight: 700; color: #222; }
    .bloco-qr {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
      gap: 0.35mm;
    }
    .qr { width: ${cfg.qrSizeMm}mm; height: ${cfg.qrSizeMm}mm; object-fit: contain; display: block; }
  `;
}

/**
 * HTML completo (sem `window.print`) para envio à ponte WebSocket no Raspberry (Chromium → CUPS).
 * Requer ambiente com `window` (cliente); retorna string vazia se `etiquetas` estiver vazio.
 */
export async function gerarDocumentoHtmlEtiquetas(
  etiquetas: EtiquetaParaImpressao[],
  formato: FormatoEtiqueta,
  opcoes?: OpcoesGerarDocumentoHtmlEtiquetas
): Promise<string> {
  if (etiquetas.length === 0) return '';

  const agoraIso = new Date().toISOString();
  const comData = etiquetas.map((e) => ({
    ...e,
    dataGeracaoIso: e.dataGeracaoIso || agoraIso,
  }));
  const itens =
    formato === '60x30' &&
    !opcoes?.preparacao60x30JaAplicada &&
    opcoes?.preparar60x30PilhasPorLado === true
      ? prepararEtiquetas60x30ParaPilhasEsquerdaDireita(comData)
      : comData;

  const cfg = FORMATO_CONFIG[formato];
  let htmlCorpo: string;
  let estilos: string;

  if (formato === '60x30') {
    const qrPorIndice = await qrTokensParaDataUrlsEmLotes(
      itens.map((it) => it.tokenQr),
      cfg.qrSizeMm
    );
    const pedacos: string[] = [];
    for (let i = 0; i < itens.length; i += 2) {
      const esq = itens[i];
      const dir = itens[i + 1] ?? null;
      pedacos.push(
        gerarFolha60x30Par(esq, dir, cfg.qrSizeMm, qrPorIndice[i], dir ? qrPorIndice[i + 1] : null)
      );
    }
    htmlCorpo = pedacos
      .map((bloco, idx) => (idx < pedacos.length - 1 ? `${bloco}<div class="page-break"></div>` : bloco))
      .join('');
    estilos = `
      html, body {
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; }
      }
      ${estilosGlobais60x30(cfg)}
      .page-break { break-after: page; page-break-after: always; }
    `;
  } else {
    const qrLegado = await qrTokensParaDataUrlsEmLotes(
      itens.map((item) => item.tokenQr),
      cfg.qrSizeMm
    );
    const folha6060Css =
      formato === '60x60'
        ? `
      .folha-6060 {
        box-sizing: border-box;
        width: 60mm;
        height: 60mm;
        margin: 0;
        padding: 0;
        overflow: hidden;
        page-break-after: always;
        break-after: page;
      }
      .folha-6060:last-of-type {
        page-break-after: auto;
        break-after: auto;
      }
      .folha-6060 .etiqueta.fmt-6060 {
        width: 100%;
        height: 100%;
      }
    `
        : '';
    htmlCorpo = itens
      .map((item, index) => {
        const inner = gerarHtmlEtiquetaLegado(item, formato, qrLegado[index]);
        if (formato === '60x60') {
          return `<div class="folha-6060">${inner}</div>`;
        }
        const quebra = index < itens.length - 1 ? '<div class="page-break"></div>' : '';
        return `${inner}${quebra}`;
      })
      .join('');
    estilos = `
      html, body {
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; }
      }
      ${estilosGlobaisLegado(formato)}
      ${folha6060Css}
      .page-break { break-after: page; page-break-after: always; }
    `;
  }

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>&#8203;</title><style>${estilos}</style></head><body>${htmlCorpo}</body></html>`;
}

export async function imprimirEtiquetasEmJobUnico(
  etiquetas: EtiquetaParaImpressao[],
  formato: FormatoEtiqueta,
  opcoesHtml?: OpcoesGerarDocumentoHtmlEtiquetas
): Promise<boolean> {
  if (typeof window === 'undefined' || etiquetas.length === 0) return false;

  const doc = await gerarDocumentoHtmlEtiquetas(etiquetas, formato, opcoesHtml);
  if (!doc) return false;

  const comPrint = doc.replace(
    '</body>',
    `<script>window.onload=function(){window.print();};</script></body>`
  );

  const janela = window.open('', '_blank', 'width=420,height=560');
  if (!janela) return false;

  janela.document.open();
  janela.document.write(comPrint);
  janela.document.close();
  return true;
}

/**
 * Abre nova aba com o mesmo HTML da impressão/Pi, **sem** `window.print` — para conferir layout antes de enviar à fila.
 */
export async function abrirPreviaEtiquetasEmJanela(
  etiquetas: EtiquetaParaImpressao[],
  formato: FormatoEtiqueta,
  opcoes?: OpcoesPreviaEtiquetasJanela
): Promise<boolean> {
  if (typeof window === 'undefined' || etiquetas.length === 0) return false;

  const { mensagemBarra, ...opcoesGerador } = opcoes ?? {};
  const doc = await gerarDocumentoHtmlEtiquetas(
    etiquetas,
    formato,
    Object.keys(opcoesGerador).length > 0 ? opcoesGerador : undefined
  );
  if (!doc) return false;

  const n = etiquetas.length;
  const labelFmt = FORMATO_CONFIG[formato].label;
  const backUrl = `${window.location.origin}/etiquetas`;
  const extraLinha = mensagemBarra
    ? `<div style="margin-top:6px;font-size:12px;opacity:0.92;font-weight:500;max-width:42rem;margin-left:auto;margin-right:auto;">${escaparHtml(mensagemBarra)}</div>`
    : '';
  const faixa = `
    <div
      id="previa-etiquetas-faixa"
      role="status"
      style="position:sticky;top:0;left:0;right:0;z-index:2147483647;background:#0f172a;color:#f8fafc;padding:10px 12px;font:13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,0.25);"
    >
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;max-width:56rem;margin:0 auto;">
        <div style="display:flex;gap:10px;align-items:center;min-width:0;">
          <a href="${escaparHtml(backUrl)}" style="display:inline-block;text-decoration:none;background:rgba(255,255,255,0.12);color:#f8fafc;padding:6px 10px;border-radius:999px;font-weight:700;white-space:nowrap;">
            Voltar
          </a>
          <button onclick="window.close()" style="appearance:none;border:0;cursor:pointer;background:rgba(255,255,255,0.12);color:#f8fafc;padding:6px 10px;border-radius:999px;font-weight:700;white-space:nowrap;">
            Fechar
          </button>
        </div>
        <div style="text-align:right;min-width:0;">
          <strong>Prévia</strong> — ${n} etiqueta(s) · ${escaparHtml(labelFmt)}
        </div>
      </div>
      ${extraLinha}
    </div>
  `.trim();

  const comFaixa = doc.replace('<body>', `<body>${faixa}`);

  const janela = window.open('', '_blank', 'width=520,height=720');
  if (!janela) return false;

  janela.document.open();
  janela.document.write(comFaixa);
  janela.document.close();
  return true;
}
