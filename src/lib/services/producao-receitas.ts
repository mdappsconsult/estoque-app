import { supabase } from '@/lib/supabase';
import type { ProducaoReceita, ProducaoReceitaItem, Produto } from '@/types/database';

export type LinhaInsumoProducaoState = {
  key: string;
  produto_id: string;
  quantidade: string;
  massa_valor: string;
};

export function novoKeyLinhaInsumo(): string {
  return typeof crypto !== 'undefined' ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`;
}

export function novaLinhaInsumoVazia(): LinhaInsumoProducaoState {
  return {
    key: novoKeyLinhaInsumo(),
    produto_id: '',
    quantidade: '',
    massa_valor: '',
  };
}

export function produtoUsaMassaInsumo(p: Produto | undefined): boolean {
  return Boolean(p?.producao_consumo_por_massa);
}

/** Gramas por dose no cadastro (>0 = campo «doses» na produção). */
export function gramasPorDoseProduto(p: Produto | undefined): number {
  if (!p) return 0;
  const n = Math.floor(Number(p.producao_gramas_por_dose) || 0);
  return n > 0 ? n : 0;
}

/**
 * Gramas que a produção vai consumir (mesma regra que `gramasInformadasLinha` em `/producao`).
 * `massa_valor` = doses se g/dose &gt; 0, senão kg (ex.: 60 → 60 000 g).
 */
export function previewGramasInsumo(massaValor: string, p: Produto | undefined): number | null {
  if (!p || !produtoUsaMassaInsumo(p)) return null;
  const raw = String(massaValor).trim().replace(',', '.');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const gd = gramasPorDoseProduto(p);
  if (gd > 0) return Math.floor(n * gd);
  return Math.floor(n * 1000);
}

export type ProducaoReceitaComItens = ProducaoReceita & {
  producao_receita_itens: ProducaoReceitaItem[];
};

const SELECT_RECEITA_COM_ITENS = `
  *,
  producao_receita_itens (
    id,
    receita_id,
    ordem,
    produto_id,
    qtd_qr,
    massa_valor,
    created_at
  )
`;

/** Receitas ativas; itens ordenados por `ordem`. Se `produtoAcabadoId` informado, receitas daquele acabado primeiro. */
export async function listarReceitasAtivasParaProducao(
  produtoAcabadoId?: string | null
): Promise<{ receitas: ProducaoReceitaComItens[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('producao_receitas')
    .select(SELECT_RECEITA_COM_ITENS)
    .eq('ativo', true)
    .order('nome', { ascending: true });

  if (error) {
    return { receitas: [], error: new Error(error.message) };
  }

  const raw = (data ?? []) as ProducaoReceitaComItens[];
  const ordenarItens = (r: ProducaoReceitaComItens) => ({
    ...r,
    producao_receita_itens: [...(r.producao_receita_itens ?? [])].sort((a, b) => a.ordem - b.ordem),
  });

  let receitas = raw.map(ordenarItens);
  const aid = produtoAcabadoId?.trim();
  if (aid) {
    const match = receitas.filter((r) => r.produto_acabado_id === aid);
    const rest = receitas.filter((r) => r.produto_acabado_id !== aid);
    receitas = [...match, ...rest];
  }

  return { receitas, error: null };
}

/**
 * Monta linhas para `setLinhasInsumo` a partir dos itens gravados na receita.
 * Ignora produtos inativos, fora de `produtoInsumoElegivel`, ou sem valor compatível (QR vs massa).
 */
export function linhasInsumoAPartirDaReceita(
  itens: ProducaoReceitaItem[],
  produtos: Produto[],
  produtoInsumoElegivel: (p: Produto) => boolean
): { linhas: LinhaInsumoProducaoState[]; avisos: string[] } {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const avisos: string[] = [];
  const linhas: LinhaInsumoProducaoState[] = [];
  const sorted = [...itens].sort((a, b) => a.ordem - b.ordem);

  for (const it of sorted) {
    const p = porId.get(it.produto_id);
    const nome = p?.nome ?? it.produto_id.slice(0, 8);
    if (!p) {
      avisos.push(`Item ignorado: produto não encontrado (${nome}).`);
      continue;
    }
    if (p.status !== 'ativo') {
      avisos.push(`Item ignorado: «${p.nome}» está inativo.`);
      continue;
    }
    if (!produtoInsumoElegivel(p)) {
      avisos.push(`Item ignorado: «${p.nome}» não é insumo elegível (família Insumo Industria).`);
      continue;
    }

    const massa = produtoUsaMassaInsumo(p);
    if (massa) {
      const mv = it.massa_valor?.trim() ?? '';
      if (!mv) {
        avisos.push(`Item ignorado: «${p.nome}» exige valor de massa/doses na receita.`);
        continue;
      }
      linhas.push({
        key: novoKeyLinhaInsumo(),
        produto_id: it.produto_id,
        quantidade: '',
        massa_valor: mv,
      });
    } else {
      const q = it.qtd_qr;
      if (q == null || !Number.isFinite(q) || q <= 0) {
        avisos.push(`Item ignorado: «${p.nome}» exige quantidade QR > 0 na receita.`);
        continue;
      }
      linhas.push({
        key: novoKeyLinhaInsumo(),
        produto_id: it.produto_id,
        quantidade: String(Math.floor(q)),
        massa_valor: '',
      });
    }
  }

  if (linhas.length === 0 && avisos.length === 0) {
    avisos.push('Receita sem itens válidos.');
  }

  return { linhas, avisos };
}
