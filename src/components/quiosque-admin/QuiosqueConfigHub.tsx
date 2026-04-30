'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  HelpCircle,
  Smartphone,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Store,
  CreditCard,
  ClipboardList,
  Receipt,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getMockFreezerBySlug,
  listMockFreezersResumo,
  formatBrlFromCentavos,
} from '@/lib/quiosque/mock-catalog';

type Tab = 'pontos' | 'cardapio' | 'pagamentos' | 'pedidos';

const slugDemo = 'demo-barra';

export function QuiosqueConfigHub() {
  const [tab, setTab] = useState<Tab>('cardapio');
  const freezer = useMemo(() => getMockFreezerBySlug(slugDemo), []);
  const [expandedCat, setExpandedCat] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of freezer?.categorias ?? []) init[c.id] = true;
    return init;
  });
  const resumo = useMemo(() => listMockFreezersResumo(), []);

  if (!freezer) {
    return <p className="text-zinc-400 p-6">Sem dados mock de freezer.</p>;
  }

  const toggleCat = (id: string) => {
    setExpandedCat((s) => ({ ...s, [id]: !(s[id] ?? true) }));
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#212121] text-zinc-100 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="border-b border-zinc-800 px-4 py-3 flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'pontos' as const, label: 'Pontos', Icon: Store },
            { id: 'cardapio' as const, label: 'Cardápio', Icon: ClipboardList },
            { id: 'pagamentos' as const, label: 'Pagamentos', Icon: CreditCard },
            { id: 'pedidos' as const, label: 'Pedidos', Icon: Receipt },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === id ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-800',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {tab === 'pontos' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Freezers / lojas</h2>
            <p className="text-sm text-zinc-500">
              Cadastro completo quando o banco existir. Lista mock para validar navegação.
            </p>
            <ul className="space-y-2">
              {resumo.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-700 bg-[#2a2a2a] px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-white">{r.nomeExibicao}</p>
                    <p className="text-xs text-zinc-500">
                      Slug: <code className="text-zinc-400">{r.slug}</code> · {r.localNome}
                    </p>
                  </div>
                  <Link
                    href={`/f/${r.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Abrir vitrine
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'cardapio' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">Cardápio</h1>
                <p className="text-sm text-zinc-500 mt-1 max-w-xl">
                  Este é o seu cardápio: categorias e produtos que aparecem na home do quiosque. Dados mock —
                  persistência na fase do Supabase.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  <HelpCircle className="w-4 h-4" />
                  Ajuda
                </button>
                <Link
                  href={`/f/${slugDemo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-2"
                >
                  <Smartphone className="w-4 h-4" />
                  Ver no app
                </Link>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white opacity-50 cursor-not-allowed"
                title="Após migrations"
              >
                <Plus className="w-4 h-4" />
                Adicionar categoria
              </button>
              <button
                type="button"
                disabled
                className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-500 cursor-not-allowed"
              >
                Mais ações
              </button>
              <div className="flex-1 min-w-[200px]" />
              <select
                disabled
                className="rounded-lg border border-zinc-700 bg-[#2a2a2a] text-sm text-zinc-400 px-3 py-2"
                defaultValue="all"
              >
                <option value="all">Todas as categorias</option>
              </select>
              <div className="relative min-w-[180px] flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  placeholder="Buscar nas categorias"
                  disabled
                  className="w-full rounded-lg border border-zinc-700 bg-[#2a2a2a] pl-9 pr-3 py-2 text-sm text-zinc-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              {freezer.categorias
                .sort((a, b) => a.ordem - b.ordem)
                .map((cat) => {
                  const open = expandedCat[cat.id] ?? true;
                  return (
                    <div key={cat.id} className="rounded-xl border border-zinc-700 bg-[#2a2a2a] overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-700/80">
                        <span className="text-zinc-500 text-sm tabular-nums w-6">{cat.ordem}</span>
                        <button
                          type="button"
                          onClick={() => toggleCat(cat.id)}
                          className="p-1 rounded hover:bg-zinc-700 text-zinc-400"
                          aria-expanded={open}
                        >
                          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <h3 className="font-semibold text-white flex-1">{cat.nome}</h3>
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                          Disponível
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded border border-blue-500/40 text-blue-300">
                          Mock 1 freezer
                        </span>
                        <button type="button" className="p-2 text-zinc-500 hover:text-zinc-300">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                      {open && (
                        <div className="px-4 py-3 space-y-3">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-zinc-500 border-b border-zinc-700">
                                  <th className="pb-2 pr-2 w-8" />
                                  <th className="pb-2">Produto</th>
                                  <th className="pb-2 w-28">Preço</th>
                                  <th className="pb-2">Status</th>
                                  <th className="pb-2 w-10" />
                                </tr>
                              </thead>
                              <tbody>
                                {cat.produtos
                                  .sort((a, b) => a.ordem - b.ordem)
                                  .map((p, idx) => (
                                    <tr key={p.id} className="border-b border-zinc-800/80">
                                      <td className="py-2 text-zinc-600 text-xs">{idx + 1}</td>
                                      <td className="py-2">
                                        <div className="flex items-center gap-3">
                                          <div className="relative h-11 w-11 rounded-lg overflow-hidden bg-zinc-900 shrink-0">
                                            <Image src={p.imagemSrc} alt="" fill className="object-contain p-0.5" sizes="44px" />
                                          </div>
                                          <span className="text-white font-medium">{p.nome}</span>
                                        </div>
                                      </td>
                                      <td className="py-2">
                                        <span className="text-zinc-300 tabular-nums">
                                          {formatBrlFromCentavos(p.precoCentavos)}
                                        </span>
                                      </td>
                                      <td className="py-2">
                                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-blue-500/15 text-blue-300">
                                          Disponível
                                        </span>
                                      </td>
                                      <td className="py-2 text-right">
                                        <Link
                                          href={`/configuracoes/quiosque/produto/${p.id}`}
                                          className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                                        >
                                          Editar
                                        </Link>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Link
                              href="/configuracoes/quiosque/produto/novo"
                              className="inline-flex items-center gap-2 rounded-lg border border-blue-500/50 text-blue-300 px-3 py-2 text-sm hover:bg-blue-500/10"
                            >
                              <Plus className="w-4 h-4" />
                              Adicionar produto
                            </Link>
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 text-zinc-500 px-3 py-2 text-sm cursor-not-allowed"
                            >
                              Importar produto
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {tab === 'pagamentos' && (
          <div className="space-y-4 max-w-2xl">
            <h2 className="text-lg font-semibold text-white">Pagamentos (PIX)</h2>
            <p className="text-sm text-zinc-500">
              No deploy, configure <code className="text-zinc-400">MERCADOPAGO_ACCESS_TOKEN</code> no Railway
              (runtime). Cadastre a URL do webhook apontando para a rota da API (a criar na fase MP).
            </p>
            <ul className="list-disc list-inside text-sm text-zinc-400 space-y-2">
              <li>Ambiente sandbox vs produção documentado no .env.example quando existir integração.</li>
              <li>Nunca expor o access token no browser.</li>
            </ul>
          </div>
        )}

        {tab === 'pedidos' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Pedidos</h2>
            <p className="text-sm text-zinc-500">Lista vazia até existir tabela de pedidos e checkout real.</p>
            <div className="rounded-xl border border-dashed border-zinc-700 py-16 text-center text-zinc-500 text-sm">
              Nenhum pedido (mock)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
