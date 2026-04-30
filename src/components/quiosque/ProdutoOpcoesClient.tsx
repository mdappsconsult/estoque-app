'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { MockGrupoComplemento, MockProdutoCardapio } from '@/lib/quiosque/mock-catalog';
import { formatBrlFromCentavos } from '@/lib/quiosque/mock-catalog';

type Props = {
  slug: string;
  produto: MockProdutoCardapio;
};

function selecaoValida(grupo: MockGrupoComplemento, ids: Set<string>): boolean {
  const n = grupo.opcoes.filter((o) => ids.has(o.id)).length;
  return n >= grupo.min && n <= grupo.max;
}

export function ProdutoOpcoesClient({ slug, produto }: Props) {
  const [porGrupo, setPorGrupo] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const g of produto.grupos) {
      init[g.id] = new Set();
    }
    return init;
  });

  const totalAdicional = useMemo(() => {
    let t = 0;
    for (const g of produto.grupos) {
      const sel = porGrupo[g.id] ?? new Set();
      for (const op of g.opcoes) {
        if (sel.has(op.id)) t += op.precoAdicionalCentavos;
      }
    }
    return t;
  }, [produto.grupos, porGrupo]);

  const precoFinal = produto.precoCentavos + totalAdicional;

  const toggleOpcao = (grupo: MockGrupoComplemento, opcaoId: string) => {
    setPorGrupo((prev) => {
      const cur = new Set(prev[grupo.id] ?? []);
      if (cur.has(opcaoId)) {
        cur.delete(opcaoId);
      } else {
        if (grupo.max === 1) {
          cur.clear();
          cur.add(opcaoId);
        } else {
          if (cur.size >= grupo.max) return prev;
          cur.add(opcaoId);
        }
      }
      return { ...prev, [grupo.id]: cur };
    });
  };

  const gruposOk =
    produto.grupos.length === 0 ||
    produto.grupos.every((g) => selecaoValida(g, porGrupo[g.id] ?? new Set()));

  if (produto.grupos.length === 0) {
    return (
      <div className="mt-8 space-y-4">
        <p className="text-sm text-zinc-500">Este item não tem complementos obrigatórios.</p>
        <Link
          href={`/f/${slug}/carrinho?demo=1&item=${encodeURIComponent(produto.nome)}`}
          className="block w-full text-center rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5"
        >
          Adicionar · {formatBrlFromCentavos(precoFinal)}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      {produto.grupos
        .sort((a, b) => a.ordem - b.ordem)
        .map((grupo) => {
          const sel = porGrupo[grupo.id] ?? new Set();
          const ok = selecaoValida(grupo, sel);
          return (
            <div key={grupo.id} className="relative pl-4 border-l-2 border-orange-500/80">
              <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-orange-500" />
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h2 className="font-semibold text-white">{grupo.titulo}</h2>
                <span
                  className={
                    grupo.min >= 1
                      ? 'text-[10px] uppercase px-2 py-0.5 rounded bg-orange-500/20 text-orange-300'
                      : 'text-[10px] uppercase px-2 py-0.5 rounded bg-zinc-700 text-zinc-300'
                  }
                >
                  {grupo.min >= 1 ? 'Obrigatório' : 'Opcional'}
                </span>
                <span className="text-xs text-zinc-500">
                  Mín: {grupo.min} · Máx: {grupo.max || '—'}
                </span>
                {!ok && <span className="text-xs text-amber-400">Ajuste sua escolha</span>}
              </div>
              {grupo.descricao && <p className="text-xs text-zinc-500 mb-3">{grupo.descricao}</p>}
              <ul className="space-y-2">
                {grupo.opcoes
                  .sort((a, b) => a.ordem - b.ordem)
                  .map((op) => {
                    const ativo = sel.has(op.id);
                    return (
                      <li key={op.id}>
                        <button
                          type="button"
                          onClick={() => toggleOpcao(grupo, op.id)}
                          className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                            ativo
                              ? 'border-blue-500 bg-blue-500/10 text-white'
                              : 'border-zinc-700 bg-[#262626] text-zinc-200 hover:border-zinc-500'
                          }`}
                        >
                          <span>{op.nome}</span>
                          <span className="text-blue-300 font-medium tabular-nums">
                            {op.precoAdicionalCentavos > 0
                              ? `+ ${formatBrlFromCentavos(op.precoAdicionalCentavos)}`
                              : 'incluso'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          );
        })}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a] to-transparent pt-10 max-w-lg mx-auto">
        {gruposOk ? (
          <Link
            href={`/f/${slug}/carrinho?demo=1&item=${encodeURIComponent(produto.nome)}`}
            className="block w-full text-center rounded-2xl font-semibold py-3.5 bg-blue-600 hover:bg-blue-500 text-white"
          >
            Adicionar ao carrinho · {formatBrlFromCentavos(precoFinal)}
          </Link>
        ) : (
          <span className="block w-full text-center rounded-2xl font-semibold py-3.5 bg-zinc-700 text-zinc-400 cursor-not-allowed">
            Adicionar ao carrinho · {formatBrlFromCentavos(precoFinal)}
          </span>
        )}
      </div>
    </div>
  );
}
