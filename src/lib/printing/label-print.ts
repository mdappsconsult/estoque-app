export type FormatoEtiqueta = '60x60' | '58x40' | '50x30';

export const FORMATO_IMPRESSAO_STORAGE_KEY = 'etiqueta_formato_padrao';

export const FORMATO_CONFIG: Record<FormatoEtiqueta, {
  label: string;
  widthMm: number;
  heightMm: number;
  paddingMm: number;
  qrSizeMm: number;
}> = {
  '60x60': {
    label: '60x60 mm (recomendado Zebra)',
    widthMm: 60,
    heightMm: 60,
    paddingMm: 2.5,
    qrSizeMm: 18,
  },
  '58x40': {
    label: '58x40 mm',
    widthMm: 58,
    heightMm: 40,
    paddingMm: 2,
    qrSizeMm: 14,
  },
  '50x30': {
    label: '50x30 mm',
    widthMm: 50,
    heightMm: 30,
    paddingMm: 1.5,
    qrSizeMm: 11.5,
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
}

function normalizarFormatoImpressao(valor: string | null): FormatoEtiqueta {
  if (valor === '60x60' || valor === '58x40' || valor === '50x30') {
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

function extrairVolumeProduto(nome: string): string {
  const match = nome.match(/(\d+\s?L)\b/i);
  return match ? match[1].replace(/\s+/g, '').toUpperCase() : '';
}

function gerarHtmlEtiqueta(item: EtiquetaParaImpressao, formato: FormatoEtiqueta): string {
  const cfg = FORMATO_CONFIG[formato];
  const produtoNome = escaparHtml(item.produtoNome || 'BALDE ACAI').toUpperCase();
  const volume = escaparHtml(extrairVolumeProduto(item.produtoNome));
  const lote = escaparHtml(item.lote || '-');
  const responsavel = escaparHtml(item.responsavel || '-');
  const tokenShort = escaparHtml(item.tokenShort || item.id.slice(0, 8).toUpperCase());
  const tokenQr = escaparHtml(item.tokenQr);
  const manipulacao = escaparHtml(formatarDataPtBr(item.dataManipulacao));
  const validade = escaparHtml(formatarDataPtBr(item.dataValidade));
  const qrPx = Math.max(120, Math.round(cfg.qrSizeMm * 7));
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrPx}x${qrPx}&data=${encodeURIComponent(item.tokenQr)}`;

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
        <img class="qr" src="${qrImageUrl}" alt="QR Code" />
      </div>
    </div>
  `;
}

export function obterFormatoImpressaoPadrao(): FormatoEtiqueta {
  if (typeof window === 'undefined') return '60x60';
  return normalizarFormatoImpressao(window.localStorage.getItem(FORMATO_IMPRESSAO_STORAGE_KEY));
}

export function confirmarImpressao(totalEtiquetas: number): boolean {
  if (typeof window === 'undefined') return false;
  return window.confirm(`Deseja realmente imprimir ${totalEtiquetas} etiqueta(s)?`);
}

export function imprimirEtiquetasEmJobUnico(etiquetas: EtiquetaParaImpressao[], formato: FormatoEtiqueta): boolean {
  if (typeof window === 'undefined' || etiquetas.length === 0) return false;

  const cfg = FORMATO_CONFIG[formato];
  const htmlEtiquetas = etiquetas
    .map((item, index) => {
      const quebra = index < etiquetas.length - 1 ? '<div class="page-break"></div>' : '';
      return `${gerarHtmlEtiqueta(item, formato)}${quebra}`;
    })
    .join('');

  const janela = window.open('', '_blank', 'width=420,height=560');
  if (!janela) return false;

  janela.document.open();
  janela.document.write(`
    <html>
      <head>
        <title>Impressao Lote (${etiquetas.length})</title>
        <style>
          @page {
            size: ${cfg.widthMm}mm ${cfg.heightMm}mm;
            margin: 0;
          }
          html, body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
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
          .data-row .label {
            font-size: 9pt;
            font-weight: 800;
          }
          .data-row .valor {
            font-size: 9pt;
            font-weight: 700;
          }
          .rodape {
            margin-top: 1mm;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 1.5mm;
          }
          .rodape-left {
            min-width: 0;
            flex: 1;
          }
          .resp {
            font-size: 7.8pt;
            font-weight: 800;
            line-height: 1.1;
            margin-bottom: 0.45mm;
          }
          .empresa {
            font-size: 5.2pt;
            line-height: 1.12;
            font-weight: 700;
            letter-spacing: 0.1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .token {
            margin-top: 0.6mm;
            font-size: 8pt;
            font-weight: 900;
            letter-spacing: 0.8px;
          }
          .token-qr {
            margin-top: 0.35mm;
            font-size: 4.7pt;
            color: #333;
            line-height: 1.05;
            max-height: 3.2mm;
            overflow: hidden;
            word-break: break-all;
          }
          .lote {
            margin-top: 0.35mm;
            font-size: 5pt;
            font-weight: 700;
            color: #222;
          }
          .qr {
            width: ${cfg.qrSizeMm}mm;
            height: ${cfg.qrSizeMm}mm;
            object-fit: contain;
          }
          .page-break {
            break-after: page;
            page-break-after: always;
          }
        </style>
      </head>
      <body>
        ${htmlEtiquetas}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  janela.document.close();
  return true;
}
