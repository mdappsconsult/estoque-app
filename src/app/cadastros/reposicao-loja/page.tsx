'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Save, Settings2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { Local, Produto } from '@/types/database';
import {
  ensureTodosProdutosNaLoja,
  getConfigProdutosLoja,
  upsertConfigProdutoLoja,
  participaReposicaoLoja,
  LojaProdutoConfigRow,
} from '@/lib/services/reposicao-loja';

export default function CadastroReposicaoLojaPage() {
  const { data: locais, loading: loadingLocais, error: errorLocais } = useRealtimeQuery<Local>({
    table: 'locais',
    select: 'id, nome, tipo, status',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: produtos, loading: loadingProdutos, error: errorProdutos } = useRealtimeQuery<Produto>({
    table: 'produtos',
    // `*` evita erro se a coluna escopo_reposicao ainda não existir no Supabase; traz origem para a regra de elegibilidade.
    select: '*',
    orderBy: { column: 'nome', ascending: true },
  });

  const lojasAtivas = useMemo(
    () => locais.filter((local) => local.tipo === 'STORE' && local.status === 'ativo'),
    [locais]
  );
  const produtosAtivos = useMemo(
    () =>
      produtos.filter(
        (produto) =>
          produto.status === 'ativo' &&
          participaReposicaoLoja(produto.escopo_reposicao, produto.origem)
      ),
    [produtos]
  );

  const ativosIdsKey = useMemo(
    () =>
      produtos
        .filter(
          (p) => p.status === 'ativo' && participaReposicaoLoja(p.escopo_reposicao, p.origem)
        )
        .map((p) => p.id)
        .sort()
        .join(','),
    [produtos]
  );

  const produtosRef = useRef(produtos);
  produtosRef.current = produtos;

  const [lojaSelecionada, setLojaSelecionada] = useState('');
  const [configs, setConfigs] = useState<LojaProdutoConfigRow[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  /** Mínimos em edição (sincronizados do servidor após cada carga). */
  const [valoresEditados, setValoresEditados] = useState<Record<string, number>>({});
  /** Ativo na loja em edição (`false` = não vende / não entra em reposição nem contagem). */
  const [ativoEditados, setAtivoEditados] = useState<Record<string, boolean>>({});
  const [ocultarInativos, setOcultarInativos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lojaUrlAplicada, setLojaUrlAplicada] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !lojasAtivas.length || lojaUrlAplicada) return;
    const q = new URLSearchParams(window.location.search).get('loja');
    if (!q || !lojasAtivas.some((l) => l.id === q)) return;
    const t = window.setTimeout(() => {
      setLojaSelecionada(q);
      setLojaUrlAplicada(true);
      window.history.replaceState({}, '', '/cadastros/reposicao-loja');
    }, 0);
    return () => window.clearTimeout(t);
  }, [lojasAtivas, lojaUrlAplicada]);

  const recarregarConfigs = useCallback(async (lojaId: string) => {
    if (!lojaId) {
      setConfigs([]);
      return;
    }
    setLoadingConfigs(true);
    try {
      const ativos = produtosRef.current.filter(
        (p) => p.status === 'ativo' && participaReposicaoLoja(p.escopo_reposicao, p.origem)
      );
      await ensureTodosProdutosNaLoja(
        lojaId,
        ativos.map((p) => p.id)
      );
      const data = await getConfigProdutosLoja(lojaId);
      setConfigs(data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao carregar configurações da loja');
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    void recarregarConfigs(lojaSelecionada);
  }, [lojaSelecionada, ativosIdsKey, recarregarConfigs]);

  const configPorProduto = useMemo(() => {
    const map = new Map<string, LojaProdutoConfigRow>();
    configs.forEach((c) => map.set(c.produto_id, c));
    return map;
  }, [configs]);

  const linhasOrdenadas = useMemo(
    () => [...produtosAtivos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [produtosAtivos]
  );

  const nomeLojaSelecionada = useMemo(
    () => lojasAtivas.find((l) => l.id === lojaSelecionada)?.nome ?? 'esta loja',
    [lojasAtivas, lojaSelecionada]
  );

  useEffect(() => {
    if (!lojaSelecionada || loadingConfigs) return;
    if (!ativosIdsKey) {
      setValoresEditados({});
      setAtivoEditados({});
      return;
    }
    const map = new Map(configs.map((c) => [c.produto_id, c]));
    const nextMin: Record<string, number> = {};
    const nextAtivo: Record<string, boolean> = {};
    ativosIdsKey.split(',').forEach((id) => {
      nextMin[id] = map.get(id)?.estoque_minimo_loja ?? 0;
      nextAtivo[id] = map.get(id)?.ativo_na_loja ?? true;
    });
    setValoresEditados(nextMin);
    setAtivoEditados(nextAtivo);
  }, [lojaSelecionada, loadingConfigs, configs, ativosIdsKey]);

  const alteracoes = useMemo(() => {
    return linhasOrdenadas.filter((p) => {
      const minEd = valoresEditados[p.id];
      const minSrv = configPorProduto.get(p.id)?.estoque_minimo_loja ?? 0;
      const ativoEd = ativoEditados[p.id];
      const ativoSrv = configPorProduto.get(p.id)?.ativo_na_loja ?? true;
      const minMudou = minEd !== undefined && minEd !== minSrv;
      const ativoMudou = ativoEd !== undefined && ativoEd !== ativoSrv;
      return minMudou || ativoMudou;
    });
  }, [linhasOrdenadas, valoresEditados, ativoEditados, configPorProduto]);

  const linhasVisiveis = useMemo(() => {
    if (!ocultarInativos) return linhasOrdenadas;
    return linhasOrdenadas.filter((p) => {
      const a =
        ativoEditados[p.id] !== undefined
          ? ativoEditados[p.id]
          : (configPorProduto.get(p.id)?.ativo_na_loja ?? true);
      return a;
    });
  }, [linhasOrdenadas, ocultarInativos, ativoEditados, configPorProduto]);

  const contagemAtivos = useMemo(() => {
    return linhasOrdenadas.filter((p) => {
      const a =
        ativoEditados[p.id] !== undefined
          ? ativoEditados[p.id]
          : (configPorProduto.get(p.id)?.ativo_na_loja ?? true);
      return a;
    }).length;
  }, [linhasOrdenadas, ativoEditados, configPorProduto]);

  const salvarAlteracoes = async () => {
    if (!lojaSelecionada || alteracoes.length === 0) return;
    const msg = `Salvar ${alteracoes.length} alteração(ões) (mínimo e/ou ativo na loja) em "${nomeLojaSelecionada}"?`;
    if (!window.confirm(msg)) return;

    setSaving(true);
    try {
      await Promise.all(
        alteracoes.map((p) => {
          const cfg = configPorProduto.get(p.id);
          const v = Math.max(
            0,
            Math.floor(Number(valoresEditados[p.id] ?? cfg?.estoque_minimo_loja ?? 0))
          );
          const a =
            ativoEditados[p.id] !== undefined ? ativoEditados[p.id] : (cfg?.ativo_na_loja ?? true);
          return upsertConfigProdutoLoja({
            lojaId: lojaSelecionada,
            produtoId: p.id,
            ativoNaLoja: a,
            estoqueMinimoLoja: v,
          });
        })
      );
      await recarregarConfigs(lojaSelecionada);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const loading = loadingLocais || loadingProdutos;
  const erroConsulta = errorLocais ?? errorProdutos;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (erroConsulta) {
    return (
      <div className="max-w-2xl mx-auto rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
        <h1 className="text-lg font-semibold mb-2">Falha ao carregar reposição por loja</h1>
        <p className="text-sm mb-3">
          Não foi possível ler <code className="rounded bg-red-100 px-1">locais</code> ou{' '}
          <code className="rounded bg-red-100 px-1">produtos</code> no Supabase. Detalhe:
        </p>
        <pre className="text-xs whitespace-pre-wrap break-words rounded-lg bg-white/80 border border-red-100 p-3 text-red-800">
          {erroConsulta.message}
        </pre>
        <p className="text-xs text-red-800/90 mt-4">
          Se a mensagem citar <strong>escopo_reposicao</strong>, aplique no projeto a migration{' '}
          <code className="rounded bg-red-100 px-1">20260402150000_produtos_escopo_reposicao_loja.sql</code> (Dashboard
          Supabase → SQL ou CLI). Sem essa coluna, a consulta em <code className="rounded bg-red-100 px-1">loja_produtos_config</code>{' '}
          que faz join com <code className="rounded bg-red-100 px-1">produtos</code> falha ao escolher a loja.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reposição de estoque por loja</h1>
          <p className="text-sm text-gray-500">
            Marque <span className="text-gray-700 font-medium">Ativo na loja</span> só para o que a filial realmente vende.
            Produtos desmarcados <span className="text-gray-700 font-medium">não entram</span> na lista de{' '}
            <span className="text-gray-700 font-medium">Separar por Loja</span> (reposição), na{' '}
            <span className="text-gray-700 font-medium">contagem na loja</span> nem no cálculo de faltantes. Ajuste o{' '}
            <span className="text-gray-700 font-medium">mínimo</span> para os ativos e clique em <strong>Salvar</strong>.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
        <Select
          label="Loja"
          required
          options={[
            { value: '', label: 'Selecione...' },
            ...lojasAtivas.map((loja) => ({ value: loja.id, label: loja.nome })),
          ]}
          value={lojaSelecionada}
          onChange={(e) => setLojaSelecionada(e.target.value)}
        />
      </div>

      {lojaSelecionada && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Catálogo elegível × ativos na loja</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Desmarque o que a loja não trabalha; alterações pendentes ficam em destaque até salvar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Badge variant="info" size="sm">
                {contagemAtivos} ativos
              </Badge>
              <Badge variant="default" size="sm">
                {linhasOrdenadas.length} no catálogo
              </Badge>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={loadingConfigs || saving || alteracoes.length === 0}
                onClick={() => void salvarAlteracoes()}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
                {alteracoes.length > 0 ? ` (${alteracoes.length})` : ''}
              </Button>
            </div>
          </div>

          {loadingConfigs ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
            </div>
          ) : linhasOrdenadas.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 px-4 text-center">
              Nenhum produto ativo elegível: <strong>compra</strong> (fornecedor) ou <strong>AMBOS</strong> com cadastro
              &quot;Produto de fornecedor&quot; (escopo loja). Origem <strong>produção</strong> não entra nesta tela.
            </p>
          ) : (
            <div>
              <label className="flex items-center gap-2 px-4 py-2 text-xs text-gray-600 border-b border-gray-100 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                  checked={ocultarInativos}
                  onChange={(e) => setOcultarInativos(e.target.checked)}
                />
                Ocultar produtos inativos nesta loja (lista mais curta)
              </label>
              {linhasVisiveis.length === 0 && ocultarInativos ? (
                <p className="text-sm text-gray-500 py-6 px-4 text-center">
                  Nenhum produto ativo na loja com o filtro atual. Desmarque &quot;Ocultar produtos inativos&quot; ou ative
                  itens no catálogo.
                </p>
              ) : (
              <div className="max-h-[min(70vh,560px)] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-200 bg-white sticky top-0 z-[1] shadow-[0_1px_0_0_rgb(229_231_235)]">
                      <th className="px-4 py-2.5 font-medium">Produto</th>
                      <th className="px-2 py-2.5 font-medium w-[5.5rem] text-center whitespace-nowrap">
                        Na loja
                      </th>
                      <th className="px-3 py-2.5 font-medium w-[4.5rem] text-center">Mín.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {linhasVisiveis.map((produto) => {
                      const config = configPorProduto.get(produto.id);
                      const minNoServidor = config?.estoque_minimo_loja ?? 0;
                      const ativoNoServidor = config?.ativo_na_loja ?? true;
                      const minValor =
                        valoresEditados[produto.id] !== undefined
                          ? valoresEditados[produto.id]
                          : minNoServidor;
                      const ativoValor =
                        ativoEditados[produto.id] !== undefined
                          ? ativoEditados[produto.id]
                          : ativoNoServidor;
                      const minMudou = minValor !== minNoServidor;
                      const ativoMudou = ativoValor !== ativoNoServidor;
                      const mudou = minMudou || ativoMudou;
                      const inativoVisual = !ativoValor;

                      return (
                        <tr
                          key={produto.id}
                          className={
                            mudou
                              ? 'bg-amber-50/50 hover:bg-amber-50/80'
                              : inativoVisual
                                ? 'opacity-60 hover:bg-gray-50/40'
                                : 'hover:bg-gray-50/60'
                          }
                        >
                          <td className="px-4 py-2 text-gray-900 align-middle">
                            {config?.produto?.nome || produto.nome}
                          </td>
                          <td className="px-2 py-2 align-middle text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                              checked={ativoValor}
                              disabled={loadingConfigs}
                              aria-label={`Ativo na loja: ${config?.produto?.nome || produto.nome}`}
                              onChange={(e) => {
                                setAtivoEditados((prev) => ({ ...prev, [produto.id]: e.target.checked }));
                              }}
                            />
                          </td>
                          <td className="px-3 py-1.5 align-middle text-center">
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              disabled={loadingConfigs}
                              aria-label={`Mínimo para ${config?.produto?.nome || produto.nome}`}
                              className={
                                'w-14 mx-auto block px-2 py-1 text-sm text-center tabular-nums border rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:opacity-50 ' +
                                (minMudou ? 'border-amber-400 bg-white' : 'border-gray-200')
                              }
                              value={minValor}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const n = raw === '' ? 0 : Number(raw);
                                const clamped = Number.isFinite(n) && !Number.isNaN(n)
                                  ? Math.max(0, Math.floor(n))
                                  : 0;
                                setValoresEditados((prev) => ({ ...prev, [produto.id]: clamped }));
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
