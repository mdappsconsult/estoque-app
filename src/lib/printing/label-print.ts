import QRCode from 'qrcode';

export type FormatoEtiqueta = '60x30' | '60x60' | '58x40' | '50x30';

export const FORMATO_IMPRESSAO_STORAGE_KEY = 'etiqueta_formato_padrao';

/**
 * Formato usado em **Separar por Loja** e **Produção** (não lê `localStorage`).
 * Evita impressão 60×60 legada quando alguém escolheu outro formato na tela Etiquetas nesse navegador.
 */
export const FORMATO_ETIQUETA_FLUXO_OPERACIONAL: FormatoEtiqueta = '60x30';

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
    label: '60×30 mm — 2 QR por folha (recorte no pontilhado)',
    widthMm: 60,
    heightMm: 30,
    paddingMm: 0.5,
    /** QR grande; vão até a data via flex (margin-top auto na .cel-data) */
    qrSizeMm: 14.5,
    dualPorFolha: true,
  },
  '60x60': {
    label: '60×60 mm (legado)',
    widthMm: 60,
    heightMm: 60,
    paddingMm: 2.5,
    qrSizeMm: 18,
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
  /** Ex.: nome da loja de destino na separação; na produção, nome do local/indústria. */
  nomeLoja?: string;
  /** Dia em que a etiqueta foi gerada (ex.: `created_at` ou momento da impressão). ISO. */
  dataGeracaoIso?: string;
}

function normalizarFormatoImpressao(valor: string | null): FormatoEtiqueta {
  if (valor === '60x30' || valor === '60x60' || valor === '58x40' || valor === '50x30') {
    return valor;
  }
  return '60x30';
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

function extrairVolumeProduto(nome: string): string {
  const match = nome.match(/(\d+\s?L)\b/i);
  return match ? match[1].replace(/\s+/g, '').toUpperCase() : '';
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

/** Uma metade da folha 60×30: loja, produto, QR (data URL), data de geração. */
function gerarCelula60x30(
  item: EtiquetaParaImpressao,
  qrSizeMm: number,
  classeExtra: string,
  qrDataUrl: string
): string {
  const loja = escaparHtml((item.nomeLoja || '—').trim() || '—');
  const produto = escaparHtml((item.produtoNome || 'Produto').toUpperCase().slice(0, 36));
  const dataGer = escaparHtml(formatarDataPtBr(item.dataGeracaoIso || item.dataManipulacao));
  const qrPx = pixelsQrParaImpressao(qrSizeMm);

  return `
    <div class="celula-60x30${classeExtra}">
      <div class="celula-60x30-stack">
        <div class="cel-loja">${loja}</div>
        <div class="cel-prod">${produto}</div>
        <img class="cel-qr" src="${qrDataUrl}" alt="" width="${qrPx}" height="${qrPx}" />
        <div class="cel-data">${dataGer}</div>
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

function gerarHtmlEtiquetaLegado(
  item: EtiquetaParaImpressao,
  formato: Exclude<FormatoEtiqueta, '60x30'>,
  qrDataUrl: string
): string {
  const cfg = FORMATO_CONFIG[formato];
  const produtoNome = escaparHtml(item.produtoNome || 'BALDE ACAI').toUpperCase();
  const volume = escaparHtml(extrairVolumeProduto(item.produtoNome));
  const lote = escaparHtml(item.lote || '-');
  const responsavel = escaparHtml(item.responsavel || '-');
  const tokenShort = escaparHtml(item.tokenShort || item.id.slice(0, 8).toUpperCase());
  const tokenQr = escaparHtml(item.tokenQr);
  const manipulacao = escaparHtml(formatarDataPtBr(item.dataManipulacao));
  const validade = escaparHtml(formatarDataPtBr(item.dataValidade));

  return `
    <div class="etiqueta">
      <div class="topo">
        <div class="produto">${produtoNome}</div>
        <div class="sub-linha">
          <span>RESFRIADO</span>
          <span>${volume || '&nbsp;'}</span>
        </div>
        <div class="linha"></div>
      </div>

      <div class="datas">
        <div class="data-row"><span class="label">MANIPULACAO:</span><span class="valor">${manipulacao}</span></div>
        <div class="data-row"><span class="label">VALIDADE:</span><span class="valor">${validade}</span></div>
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
        <img class="qr" src="${qrDataUrl}" alt="QR Code" />
      </div>
    </div>
  `;
}

export function obterFormatoImpressaoPadrao(): FormatoEtiqueta {
  if (typeof window === 'undefined') return '60x30';
  return normalizarFormatoImpressao(window.localStorage.getItem(FORMATO_IMPRESSAO_STORAGE_KEY));
}

/**
 * Dados fictícios para teste físico na impressora (não grava no banco).
 * 60×30: duas metades na mesma folha; demais formatos: uma etiqueta por folha.
 */
export function gerarEtiquetasDemonstracaoImpressao(formato: FormatoEtiqueta): EtiquetaParaImpressao[] {
  const agora = new Date().toISOString();
  const mk = (idSuffix: string, produtoNome: string, tokenShort: string): EtiquetaParaImpressao => ({
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
  });

  if (formato === '60x30') {
    return [
      mk('000000000001', 'AÇAÍ 5L FRUTAS VERMELHAS', 'ACA5L-T1'),
      mk('000000000002', 'LEITE PO 800G INTEGRAL', 'LT800-T2'),
    ];
  }
  return [mk('000000000099', 'PRODUTO EXEMPLO — TESTE IMPRESSORA', 'TESTE-99')];
}

export function confirmarImpressao(totalEtiquetas: number, formato?: FormatoEtiqueta): boolean {
  if (typeof window === 'undefined') return false;
  if (formato === '60x30') {
    const folhas = Math.ceil(totalEtiquetas / 2);
    return window.confirm(
      `Imprimir ${totalEtiquetas} etiqueta(s) em ${folhas} folha(s) física(s) 60×30 mm (2 QR por folha, recorte no pontilhado)?`
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
      padding: 2.35mm 0.65mm 0.85mm 0.65mm;
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
      font-size: 6.35pt;
      font-weight: 700;
      line-height: 1.05;
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin: 0 0 0.5mm 0;
    }
    .cel-prod {
      font-size: 5.25pt;
      font-weight: 800;
      line-height: 1.08;
      text-align: center;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      height: 4.15mm;
      min-height: 4.15mm;
      max-height: 4.15mm;
      margin: 0.2mm auto 0;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      -webkit-box-pack: start;
    }
    .cel-qr {
      display: block;
      width: ${qr}mm;
      height: ${qr}mm;
      max-width: ${qr}mm;
      object-fit: contain;
      margin: 0.5mm auto 0;
      flex-shrink: 0;
    }
    .cel-data {
      font-size: 5.5pt;
      font-weight: 900;
      color: #000;
      letter-spacing: 0.02em;
      margin: auto 0 0.15mm 0;
      line-height: 1;
      padding: 0;
      text-align: center;
      flex-shrink: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
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
    .sub-linha {
      margin-top: 1.1mm;
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
    .qr { width: ${cfg.qrSizeMm}mm; height: ${cfg.qrSizeMm}mm; object-fit: contain; }
  `;
}

export async function imprimirEtiquetasEmJobUnico(
  etiquetas: EtiquetaParaImpressao[],
  formato: FormatoEtiqueta
): Promise<boolean> {
  if (typeof window === 'undefined' || etiquetas.length === 0) return false;

  const agoraIso = new Date().toISOString();
  const itens = etiquetas.map((e) => ({
    ...e,
    dataGeracaoIso: e.dataGeracaoIso || agoraIso,
  }));

  const cfg = FORMATO_CONFIG[formato];
  let htmlCorpo: string;
  let estilos: string;

  if (formato === '60x30') {
    const qrPorIndice = await Promise.all(
      itens.map((it) => qrTokenParaDataUrl(it.tokenQr, cfg.qrSizeMm))
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
    const qrLegado = await Promise.all(
      itens.map((item) => qrTokenParaDataUrl(item.tokenQr, cfg.qrSizeMm))
    );
    htmlCorpo = itens
      .map((item, index) => {
        const quebra = index < itens.length - 1 ? '<div class="page-break"></div>' : '';
        return `${gerarHtmlEtiquetaLegado(item, formato, qrLegado[index])}${quebra}`;
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
      .page-break { break-after: page; page-break-after: always; }
    `;
  }

  const janela = window.open('', '_blank', 'width=420,height=560');
  if (!janela) return false;

  janela.document.open();
  janela.document.write(`
    <html>
      <head>
        <title>&#8203;</title>
        <style>${estilos}</style>
      </head>
      <body>
        ${htmlCorpo}
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  janela.document.close();
  return true;
}
