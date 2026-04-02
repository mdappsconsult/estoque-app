import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const DATA_VALIDADE_SENTINEL = '2999-12-31';

export interface GuiaSeparacaoItemPdf {
  produto_nome: string;
  produto_id: string;
  token_qr: string;
  token_short?: string | null;
  data_validade?: string | null;
}

function slugArquivo(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'loja';
}

function formatarValidade(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  if (d === DATA_VALIDADE_SENTINEL) return 'Sem validade';
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function formatarDataHoraBr(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function resumoPorProduto(itens: GuiaSeparacaoItemPdf[]): { produto: string; qtd: number }[] {
  const map = new Map<string, number>();
  for (const i of itens) {
    const nome = i.produto_nome?.trim() || '—';
    map.set(nome, (map.get(nome) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .map(([produto, qtd]) => ({ produto, qtd }));
}

/**
 * Gera e baixa o PDF da guia de separação (conferência no estoque + envio à loja).
 */
export function baixarGuiaSeparacaoPdf(params: {
  nomeOrigem: string;
  nomeDestino: string;
  responsavel: string;
  modoSeparacaoLabel: string;
  itens: GuiaSeparacaoItemPdf[];
  emitidoEmIso?: string;
}): void {
  const { nomeOrigem, nomeDestino, responsavel, modoSeparacaoLabel, itens } = params;
  const emitidoEm = params.emitidoEmIso ?? new Date().toISOString();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Guia de separação para loja', pageW / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const linhasInfo = [
    `Emitido em: ${formatarDataHoraBr(emitidoEm)}`,
    `Responsável: ${responsavel}`,
    `Modo: ${modoSeparacaoLabel}`,
    `Origem (indústria): ${nomeOrigem}`,
    `Destino (loja): ${nomeDestino}`,
    `Total de unidades: ${itens.length}`,
  ];
  linhasInfo.forEach((l) => {
    doc.text(l, 14, y);
    y += 5;
  });
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Resumo por produto (conferência)', 14, y);
  y += 2;

  const resumo = resumoPorProduto(itens);
  autoTable(doc, {
    startY: y,
    head: [['Produto', 'Quantidade']],
    body: resumo.map((r) => [r.produto, String(r.qtd)]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [220, 38, 38], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  const docComTabela = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  y = (docComTabela.lastAutoTable?.finalY ?? y + 24) + 10;

  if (y > 250) {
    doc.addPage();
    y = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Detalhe por unidade (token / validade)', 14, y);
  y += 2;

  const corpoDetalhe = itens.map((item, idx) => [
    String(idx + 1),
    item.produto_nome?.trim() || '—',
    item.token_short?.trim() || item.token_qr.slice(0, 12),
    item.token_qr,
    formatarValidade(item.data_validade),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Produto', 'Token curto', 'QR completo', 'Validade']],
    body: corpoDetalhe,
    styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' },
    headStyles: { fillColor: [55, 65, 81], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 38 },
      2: { cellWidth: 28 },
      3: { cellWidth: 52 },
      4: { cellWidth: 22 },
    },
    margin: { left: 14, right: 14 },
  });

  const slug = slugArquivo(nomeDestino);
  const stamp = emitidoEm.slice(0, 16).replace(/[-:T]/g, '');
  doc.save(`guia-separacao-${slug}-${stamp}.pdf`);
}
