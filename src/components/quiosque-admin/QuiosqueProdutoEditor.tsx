'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';
import { Plus, Search, Copy } from 'lucide-react';
import type { MockFreezer, MockProdutoCardapio } from '@/lib/quiosque/mock-catalog';
import { formatBrlFromCentavos } from '@/lib/quiosque/mock-catalog';

type Tab = 'detalhes' | 'complementos' | 'classificacao' | 'disponibilidade';

type Props =
  | { mode: 'novo' }
  | { mode: 'edit'; freezer: MockFreezer; produto: MockProdutoCardapio };

export function QuiosqueProdutoEditor(props: Props) {
  const [tab, setTab] = useState<Tab>('detalhes');

  const isNovo = props.mode === 'novo';
  const produto = isNovo ? null : props.produto;
  const freezer = isNovo ? null : props.freezer;

  const titulo = produto?.nome ?? 'Novo produto';
  const subtitulo =
    produto?.descricaoCurta ?? 'Preencha os detalhes. Salvamento após integração com Supabase.';

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#212121] text-zinc-100 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="border-b border-zinc-800 px-4 py-4 md:px-6">
        <Link
          href="/configuracoes/quiosque"
          className="text-sm text-blue-400 hover:text-blue-300 mb-3 inline-block"
        >
          ← Voltar ao cardápio
        </Link>
        <h1 className="text-2xl font-bold text-white">{titulo}</h1>
        <p className="text-sm text-zinc-500 mt-1">{subtitulo}</p>
        <nav className="flex gap-6 mt-6 border-b border-zinc-800 -mb-px">
          {(
            [
              ['detalhes', 'Detalhes'],
              ['complementos', 'Complementos'],
              ['classificacao', 'Classificação'],
              ['disponibilidade', 'Disponibilidade'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={clsx(
                'pb-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === id ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24">
        {tab === 'detalhes' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Categoria</label>
                <select
                  disabled={isNovo}
                  className="w-full rounded-lg border border-zinc-700 bg-[#2a2a2a] px-3 py-2 text-sm text-white"
                  defaultValue={produto?.categoriaId ?? ''}
                >
                  {!isNovo &&
                    freezer?.categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  {isNovo && <option value="">Selecione (com banco)</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Nome do produto</label>
                <input
                  readOnly
                  className="w-full rounded-lg border border-zinc-700 bg-[#2a2a2a] px-3 py-2 text-sm text-white"
                  defaultValue={produto?.nome ?? ''}
                />
                <p className="text-[10px] text-zinc-600 mt-1">{(produto?.nome ?? '').length}/100</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Detalhes do produto</label>
                <textarea
                  readOnly
                  rows={4}
                  className="w-full rounded-lg border border-zinc-700 bg-[#2a2a2a] px-3 py-2 text-sm text-white resize-y"
                  defaultValue={produto?.descricao ?? ''}
                />
                <p className="text-[10px] text-zinc-600 mt-1">{(produto?.descricao.length ?? 0)}/400</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Preço</label>
                <input
                  readOnly
                  className="w-full rounded-lg border border-zinc-700 bg-[#2a2a2a] px-3 py-2 text-sm text-white tabular-nums"
                  defaultValue={produto ? formatBrlFromCentavos(produto.precoCentavos) : 'R$ 0,00'}
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-2">Imagem</label>
                <div className="relative aspect-[4/3] max-h-52 rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
                  {produto ? (
                    <Image src={produto.imagemSrc} alt="" fill className="object-contain p-4" sizes="400px" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600 text-sm">
                      Upload após Storage
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">Resolução indicada: 400×300</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Código interno</label>
                <input
                  readOnly
                  placeholder="Código interno do produto"
                  className="w-full rounded-lg border border-zinc-700 bg-[#2a2a2a] px-3 py-2 text-sm text-zinc-400"
                />
              </div>
            </div>
          </div>
        )}

        {tab === 'complementos' && (
          <div className="space-y-6 max-w-2xl">
            <p className="text-sm text-zinc-500">
              Defina grupos (tamanho obrigatório, complementos opcionais, etc.). Visual alinhado ao painel de
              referência.
            </p>
            <div className="rounded-xl border border-zinc-700 bg-[#2a2a2a] p-4 space-y-4">
              <p className="text-sm text-zinc-300">Este produto tem complementos?</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="temc" disabled className="accent-orange-500" />
                <span className="text-zinc-500">Não</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="temc" defaultChecked disabled className="accent-orange-500" />
                <span>Sim, este produto tem complementos</span>
              </label>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Grupos de complementos</h3>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  placeholder="Buscar itens"
                  disabled
                  className="w-full rounded-lg border border-zinc-700 bg-[#2a2a2a] pl-9 pr-3 py-2 text-sm text-zinc-500"
                />
              </div>
              <ul className="space-y-2">
                {(produto?.grupos ?? []).map((g, i) => (
                  <li
                    key={g.id}
                    className="rounded-lg border border-zinc-700 bg-[#262626] px-3 py-3 flex flex-wrap items-center gap-3"
                  >
                    <span className="text-zinc-600 text-xs w-5">{i + 1}</span>
                    <div className="flex-1 min-w-[120px]">
                      <p className="font-medium text-white text-sm">{g.titulo}</p>
                      {g.descricao && <p className="text-xs text-zinc-500">{g.descricao}</p>}
                    </div>
                    <span className="text-xs text-zinc-500">
                      Mín {g.min} · Máx {g.max}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded border border-blue-500/40 text-blue-300">
                      Mock
                    </span>
                  </li>
                ))}
                {!produto?.grupos?.length && (
                  <li className="text-sm text-zinc-500 py-4 text-center border border-dashed border-zinc-700 rounded-lg">
                    Nenhum grupo (produto simples)
                  </li>
                )}
              </ul>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-500/50 text-blue-300 px-3 py-2 text-sm opacity-50 cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Criar novo grupo
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-500/50 text-blue-300 px-3 py-2 text-sm opacity-50 cursor-not-allowed"
                >
                  <Copy className="w-4 h-4" />
                  Copiar grupos
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'classificacao' && (
          <div className="max-w-md space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked={produto?.destaque} readOnly className="rounded accent-blue-600" />
              <span>Destacar na home do quiosque</span>
            </label>
            <p className="text-xs text-zinc-500">Tags e filtros avançados quando o banco existir.</p>
          </div>
        )}

        {tab === 'disponibilidade' && (
          <div className="max-w-lg space-y-4">
            <p className="text-sm text-zinc-500">
              Aqui você define em que momentos os clientes poderão comprar. MVP: somente sempre disponível.
            </p>
            <label className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-[#2a2a2a] p-4 cursor-pointer">
              <input type="radio" name="disp" defaultChecked className="mt-1 accent-orange-500" readOnly />
              <div>
                <p className="font-medium text-white">Sempre disponível</p>
                <p className="text-xs text-zinc-500 mt-1">O item fica disponível enquanto o cardápio estiver ativo.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-[#2a2a2a] p-4 opacity-60">
              <input type="radio" name="disp" disabled className="mt-1" />
              <div>
                <p className="font-medium text-zinc-400">Dias e horários específicos</p>
                <p className="text-xs text-zinc-600 mt-1">Em breve.</p>
              </div>
            </label>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-64 border-t border-zinc-800 bg-[#1f1f1f] px-4 py-3 flex justify-end gap-2 z-10">
        <Link
          href="/configuracoes/quiosque"
          className="px-4 py-2 rounded-lg border border-zinc-600 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Cancelar
        </Link>
        <button
          type="button"
          disabled
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium opacity-50 cursor-not-allowed"
          title="Aguardando Supabase"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
