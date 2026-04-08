'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, PencilLine, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffectivePermissionsMap } from '@/hooks/useEffectivePermissionsMap';
import { hasAccessWithMap } from '@/lib/permissions';
import {
  buscarCadastrosIndustriaHojeParaSeparacao,
  intervaloLocalHojeIso,
} from '@/lib/services/cadastros-hoje-separacao';

type Props = {
  lojaDestinoId: string | null;
  /** Nome amigável da loja quando há filtro. */
  nomeLojaDestinoLabel?: string | null;
};

export default function CadastrosIndustriaDiaPainel({ lojaDestinoId, nomeLojaDestinoLabel }: Props) {
  const { usuario } = useAuth();
  const permissionsMap = useEffectivePermissionsMap();
  const pode = (href: string) => (usuario ? hasAccessWithMap(usuario.perfil, href, permissionsMap) : false);

  const [resumo, setResumo] = useState<Awaited<ReturnType<typeof buscarCadastrosIndustriaHojeParaSeparacao>> | null>(
    null
  );
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const { inicioIso, fimIso } = intervaloLocalHojeIso();
      const dados = await buscarCadastrosIndustriaHojeParaSeparacao({
        lojaDestinoId: lojaDestinoId?.trim() || null,
        inicioIso,
        fimIso,
      });
      setResumo(dados);
    } catch (e: unknown) {
      setResumo(null);
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os cadastros do dia');
    } finally {
      setCarregando(false);
    }
  }, [lojaDestinoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const editReposicao = pode('/cadastros/reposicao-loja');
  const editProdutos = pode('/cadastros/produtos');
  const editLocais = pode('/cadastros/locais');

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <CalendarDays className="w-5 h-5 text-violet-700 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-bold text-violet-950">Cadastros no Supabase (hoje neste aparelho)</p>
            <p className="text-xs text-violet-900/90 mt-0.5 leading-relaxed">
              Alterações de hoje que afetam <strong>envio para as lojas</strong> (reposição, produtos elegíveis, lojas
              novas).
            </p>
            {lojaDestinoId && nomeLojaDestinoLabel ? (
              <p className="text-[11px] text-violet-800 mt-1">
                Reposição filtrada: <strong>{nomeLojaDestinoLabel}</strong>.
              </p>
            ) : (
              <p className="text-[11px] text-violet-800 mt-1">
                Sem filtro de loja: até <strong>120</strong> linhas de reposição de qualquer filial.
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={carregando}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-900 bg-white border border-violet-200 rounded-lg px-2.5 py-1.5 hover:bg-violet-100 disabled:opacity-50 shrink-0"
        >
          {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Atualizar
        </button>
      </div>

      {erro && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{erro}</p>
      )}

      {carregando && !resumo && !erro && (
        <div className="flex items-center gap-2 text-xs text-violet-800 py-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Consultando Supabase…
        </div>
      )}

      {resumo && (
        <div className="space-y-3 max-h-[min(22rem,55vh)] overflow-y-auto text-xs">
          {(() => {
            const { configsLoja, produtosNovos, lojasNovas } = resumo;
            const vazio = configsLoja.length === 0 && produtosNovos.length === 0 && lojasNovas.length === 0;
            if (vazio) {
              return (
                <p className="text-violet-800 py-2 leading-relaxed">
                  Nada encontrado hoje nessas tabelas
                  {lojaDestinoId ? ' para esta loja' : ''}. Se acabou de salvar, toque em <strong>Atualizar</strong>.
                </p>
              );
            }
            return (
              <>
                {configsLoja.length > 0 && (
                  <div>
                    <p className="font-semibold text-violet-950 mb-1.5">Reposição na loja (mínimo / ativo na loja)</p>
                    <ul className="space-y-1.5 border border-violet-100 rounded-lg bg-white/80 p-2">
                      {configsLoja.map((c) => (
                        <li
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-50 last:border-0 pb-1.5 last:pb-0"
                        >
                          <span className="text-violet-950 min-w-0">
                            <span className="font-medium">{c.produto_nome}</span>
                            <span className="text-violet-600"> · {c.loja_nome}</span>
                            <span className="block text-[10px] text-violet-700">
                              mín. {c.estoque_minimo_loja} · {c.ativo_na_loja ? 'ativo na loja' : 'inativo'} ·{' '}
                              {c.evento === 'criado_hoje' ? 'criado hoje' : 'atualizado hoje'} ·{' '}
                              {new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </span>
                          {editReposicao ? (
                            <Link
                              href={`/cadastros/reposicao-loja?loja=${c.loja_id}`}
                              className="inline-flex items-center gap-1 shrink-0 font-semibold text-violet-800 underline decoration-violet-300 underline-offset-2"
                            >
                              <PencilLine className="w-3.5 h-3.5" aria-hidden />
                              Editar
                            </Link>
                          ) : (
                            <span className="text-[10px] text-violet-500 shrink-0">Sem permissão p/ editar</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {produtosNovos.length > 0 && (
                  <div>
                    <p className="font-semibold text-violet-950 mb-1.5">Produtos criados hoje (reposição loja)</p>
                    <ul className="space-y-1.5 border border-violet-100 rounded-lg bg-white/80 p-2">
                      {produtosNovos.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-50 last:border-0 pb-1.5 last:pb-0"
                        >
                          <span className="text-violet-950 min-w-0">
                            <span className="font-medium">{p.nome}</span>
                            <span className="block text-[10px] text-violet-700">Origem: {p.origem}</span>
                          </span>
                          {editProdutos ? (
                            <Link
                              href={`/cadastros/produtos?editar=${p.id}`}
                              className="inline-flex items-center gap-1 shrink-0 font-semibold text-violet-800 underline decoration-violet-300 underline-offset-2"
                            >
                              <PencilLine className="w-3.5 h-3.5" aria-hidden />
                              Editar
                            </Link>
                          ) : (
                            <span className="text-[10px] text-violet-500 shrink-0">Sem permissão p/ editar</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {lojasNovas.length > 0 && (
                  <div>
                    <p className="font-semibold text-violet-950 mb-1.5">Lojas (STORE) cadastradas hoje</p>
                    <ul className="space-y-1.5 border border-violet-100 rounded-lg bg-white/80 p-2">
                      {lojasNovas.map((l) => (
                        <li
                          key={l.id}
                          className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-50 last:border-0 pb-1.5 last:pb-0"
                        >
                          <span className="font-medium text-violet-950">{l.nome}</span>
                          {editLocais ? (
                            <Link
                              href={`/cadastros/locais?editar=${l.id}`}
                              className="inline-flex items-center gap-1 shrink-0 font-semibold text-violet-800 underline decoration-violet-300 underline-offset-2"
                            >
                              <PencilLine className="w-3.5 h-3.5" aria-hidden />
                              Editar
                            </Link>
                          ) : (
                            <span className="text-[10px] text-violet-500 shrink-0">Sem permissão p/ editar</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
