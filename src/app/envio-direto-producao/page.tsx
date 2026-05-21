'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Truck,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  Plus,
  ClipboardList,
  ChevronDown,
  RefreshCw,
  Radio,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';
import {
  criarEnvioDiretoProducao,
  cancelarEnvioDiretoSemBips,
  listarDemandaBaldesProducaoPorLoja,
  listarConferenciaEntregasNasLojas,
  listarSaidasAvulsasRecentes,
  type DemandaPorLojaRow,
  type EnvioDiretoResumo,
  type SaidaAvulsaAgrupada,
} from '@/lib/services/envio-direto-producao';

interface LocalLoja {
  id: string;
  nome: string;
}

interface ProdutoBalde {
  id: string;
  nome: string;
}

function statusEntregaLabel(status: EnvioDiretoResumo['status']): string {
  if (status === 'DELIVERED') return 'Concluído';
  if (status === 'DIVERGENCE') return 'Divergência';
  return 'Aguardando bip na loja';
}

function formatHoraBip(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function EntregaConferenciaCard({
  entrega,
  onCancelar,
}: {
  entrega: EnvioDiretoResumo;
  onCancelar: (id: string) => void;
}) {
  const completo = entrega.bipados >= entrega.quantidadeDemandada;
  const emAberto = !['DELIVERED', 'DIVERGENCE'].includes(entrega.status);
  const pct =
    entrega.quantidadeDemandada > 0
      ? Math.min(100, Math.round((entrega.bipados / entrega.quantidadeDemandada) * 100))
      : 0;

  return (
    <li
      className={`border rounded-lg px-3 py-3 ${
        completo && entrega.status === 'DELIVERED'
          ? 'border-green-200 bg-green-50/50'
          : entrega.faltam > 0 && emAberto
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-gray-200'
      }`}
    >
      <div className="flex flex-wrap items-start gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate" title={entrega.destinoNome}>
            {entrega.destinoNome}
          </p>
          <p className="text-xs text-gray-600 truncate" title={entrega.produtoNome}>
            {entrega.produtoNome}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums leading-tight">
            <span className={completo ? 'text-green-700' : 'text-blue-700'}>{entrega.bipados}</span>
            <span className="text-gray-400 font-normal"> / </span>
            <span className="text-gray-800">{entrega.quantidadeDemandada}</span>
          </p>
          <p className="text-[11px] text-gray-500">gripados na loja</p>
        </div>
      </div>

      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden" aria-hidden>
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            completo ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={completo ? 'success' : entrega.faltam > 0 ? 'warning' : 'default'}>
          {entrega.faltam > 0 ? `Faltam ${entrega.faltam}` : 'Todos gripados'}
        </Badge>
        <span className="text-[11px] text-gray-500">{statusEntregaLabel(entrega.status)}</span>
        <span className="text-[11px] text-gray-400 ml-auto">
          {new Date(entrega.criadoEm).toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-2">
        <p className="text-xs font-semibold text-gray-800 mb-1.5">
          Baldes gripados ({entrega.tokensBipados.length})
        </p>
        {entrega.tokensBipados.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhum bip ainda — aguardando a loja.</p>
        ) : (
          <ul className="space-y-1.5">
            {entrega.tokensBipados.map((t, i) => (
              <li
                key={`${t.tokenShort}-${t.recebidoEm ?? i}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs bg-white border border-gray-100 rounded-md px-2 py-1.5"
              >
                <span className="font-mono font-medium text-gray-900">{t.tokenShort}</span>
                <span className="text-gray-500">{formatHoraBip(t.recebidoEm)}</span>
                {t.recebidoPorNome ? (
                  <span className="text-gray-600 truncate" title={t.recebidoPorNome}>
                    · {t.recebidoPorNome}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {entrega.faltam > 0 && emAberto && (
          <p className="mt-2 text-xs text-amber-900">
            Faltam gripagem: <strong>{entrega.faltam}</strong> balde(s). Peça à loja usar a remessa{' '}
            <strong>envio direto</strong> em Receber Entrega.
          </p>
        )}
      </div>

      {entrega.bipados === 0 && emAberto && (
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={() => onCancelar(entrega.id)}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancelar envio
          </Button>
        </div>
      )}
    </li>
  );
}

export default function EnvioDiretoProducaoPage() {
  const { usuario } = useAuth();
  const [warehouses, setWarehouses] = useState<LocalLoja[]>([]);
  const [stores, setStores] = useState<LocalLoja[]>([]);
  const [produtosBaldes, setProdutosBaldes] = useState<ProdutoBalde[]>([]);
  const [origemId, setOrigemId] = useState('');
  const [lojaId, setLojaId] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [demanda, setDemanda] = useState<DemandaPorLojaRow[]>([]);
  const [entregas, setEntregas] = useState<EnvioDiretoResumo[]>([]);
  const [saidasAvulsas, setSaidasAvulsas] = useState<SaidaAvulsaAgrupada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const entregasIdsRef = useRef<Set<string>>(new Set());

  const recarregarPaineis = useCallback(async (origem: string) => {
    if (!origem) {
      setDemanda([]);
      setEntregas([]);
      setSaidasAvulsas([]);
      return;
    }
    try {
      const [d, e, sa] = await Promise.all([
        listarDemandaBaldesProducaoPorLoja(origem),
        listarConferenciaEntregasNasLojas(origem, 48),
        listarSaidasAvulsasRecentes(origem, 48),
      ]);
      setDemanda(d);
      setEntregas(e);
      setSaidasAvulsas(sa);
      entregasIdsRef.current = new Set(e.map((x) => x.id));
      setUltimaSync(new Date());
    } catch (err) {
      console.error('Falha ao carregar painel envio direto:', err);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      setCarregando(true);
      try {
        const [{ data: locais, error: eL }, { data: prods, error: eP }] = await Promise.all([
          supabase
            .from('locais')
            .select('id, nome, tipo')
            .eq('status', 'ativo')
            .order('nome', { ascending: true }),
          supabase
            .from('produtos')
            .select('id, nome')
            .eq('status', 'ativo')
            .in('origem', ['PRODUCAO', 'AMBOS'])
            .order('nome', { ascending: true }),
        ]);
        if (eL) throw eL;
        if (eP) throw eP;
        if (!ativo) return;
        const ws = (locais || [])
          .filter((l) => (l as { tipo: string }).tipo === 'WAREHOUSE')
          .map((l) => ({ id: (l as { id: string }).id, nome: (l as { nome: string }).nome }));
        const ss = (locais || [])
          .filter((l) => (l as { tipo: string }).tipo === 'STORE')
          .map((l) => ({ id: (l as { id: string }).id, nome: (l as { nome: string }).nome }));
        setWarehouses(ws);
        setStores(ss);
        setProdutosBaldes(
          (prods || []).map((p) => ({ id: (p as { id: string }).id, nome: (p as { nome: string }).nome }))
        );

        const padrao = usuario?.local_padrao_id?.trim();
        const origemInicial = padrao && ws.some((w) => w.id === padrao) ? padrao : ws[0]?.id || '';
        setOrigemId(origemInicial);
        if (origemInicial) {
          await recarregarPaineis(origemInicial);
        }
      } catch (err) {
        if (ativo) setErro(errMessage(err, 'Falha ao carregar dados.'));
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, [usuario?.local_padrao_id, recarregarPaineis]);

  useEffect(() => {
    if (origemId) void recarregarPaineis(origemId);
  }, [origemId, recarregarPaineis]);

  useEffect(() => {
    if (!origemId) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refetchDebounced = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void recarregarPaineis(origemId);
      }, 200);
    };

    const deveRefetchPorRemessa = (transferenciaId: string | undefined) => {
      if (!transferenciaId) return false;
      const ids = entregasIdsRef.current;
      return ids.size === 0 || ids.has(transferenciaId);
    };

    const channel = supabase
      .channel(`conferencia-entregas-${origemId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencia_itens' },
        (payload) => {
          const novo = (payload.new as { transferencia_id?: string } | null)?.transferencia_id;
          const velho = (payload.old as { transferencia_id?: string } | null)?.transferencia_id;
          if (deveRefetchPorRemessa(novo) || deveRefetchPorRemessa(velho)) {
            refetchDebounced();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transferencias',
          filter: `origem_id=eq.${origemId}`,
        },
        () => refetchDebounced()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transferencias',
          filter: `origem_id=eq.${origemId}`,
        },
        () => refetchDebounced()
      )
      .subscribe();

    const fallback = window.setInterval(() => {
      void recarregarPaineis(origemId);
    }, 60000);

    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
      window.clearInterval(fallback);
    };
  }, [origemId, recarregarPaineis]);

  const entregasAbertas = useMemo(
    () => entregas.filter((e) => !['DELIVERED', 'DIVERGENCE'].includes(e.status)),
    [entregas]
  );

  const carregarDaDemanda = (row: DemandaPorLojaRow) => {
    setLojaId(row.lojaId);
    setProdutoId(row.produtoId);
    setQuantidade(String(row.faltante));
    setAviso(null);
    setErro('');
  };

  const podeCriar = useMemo(() => {
    const q = Math.floor(Number(quantidade));
    return Boolean(origemId && lojaId && produtoId && Number.isFinite(q) && q >= 1);
  }, [origemId, lojaId, produtoId, quantidade]);

  const criar = async () => {
    if (!usuario || !podeCriar) return;
    const q = Math.floor(Number(quantidade));
    setErro('');
    setAviso(null);
    setCriando(true);
    try {
      await criarEnvioDiretoProducao({
        origemId,
        destinoId: lojaId,
        produtoId,
        quantidade: q,
        criadoPor: usuario.id,
      });
      const lojaNome = stores.find((s) => s.id === lojaId)?.nome || 'a loja';
      setAviso(
        `Registrado: ${q} balde(s) para ${lojaNome}. A loja deve bipar em Receber Entrega → remessa «envio direto». Você acompanha aqui (${q} / 0).`
      );
      setQuantidade('');
      await recarregarPaineis(origemId);
    } catch (err) {
      setErro(errMessage(err, 'Erro ao registrar a entrega.'));
    } finally {
      setCriando(false);
    }
  };

  const cancelarEnvio = async (id: string) => {
    if (!usuario) return;
    const ok = window.confirm('Cancelar este envio antes de qualquer bip da loja?');
    if (!ok) return;
    setErro('');
    try {
      await cancelarEnvioDiretoSemBips(id, usuario.id);
      await recarregarPaineis(origemId);
    } catch (err) {
      setErro(errMessage(err, 'Erro ao cancelar.'));
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conferir entregas nas lojas</h1>
          <p className="text-sm text-gray-500">
            Registre quantos baldes você deixou em cada loja e acompanhe quantos foram bipados.
          </p>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-900">{erro}</p>
          <button onClick={() => setErro('')} className="ml-auto" aria-label="Fechar">
            <X className="w-4 h-4 text-red-700" />
          </button>
        </div>
      )}

      {aviso && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-900">{aviso}</p>
          <button onClick={() => setAviso(null)} className="ml-auto" aria-label="Fechar">
            <X className="w-4 h-4 text-green-700" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-blue-200 p-5 mb-5 space-y-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">1. Registrar entrega (antes de sair da loja)</h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          Ex.: você deixou <strong>10 baldes</strong> na JK — informe loja, produto e quantidade. A loja
          bipa cada QR em <strong>Receber Entrega</strong>; aqui você vê <strong>9 / 10</strong> em tempo
          real.
        </p>
        <Select
          label="Indústria de origem"
          value={origemId}
          onChange={(e) => setOrigemId(e.target.value)}
          options={warehouses.map((w) => ({ value: w.id, label: w.nome }))}
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Loja"
            value={lojaId}
            onChange={(e) => setLojaId(e.target.value)}
            options={[
              { value: '', label: 'Selecione…' },
              ...stores.map((s) => ({ value: s.id, label: s.nome })),
            ]}
          />
          <Select
            label="Produto (balde)"
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
            options={[
              { value: '', label: 'Selecione…' },
              ...produtosBaldes.map((p) => ({ value: p.id, label: p.nome })),
            ]}
          />
        </div>
        <Input
          label="Quantidade de baldes que você está deixando"
          type="number"
          min={1}
          step={1}
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          placeholder="Ex.: 10"
        />
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          disabled={!podeCriar || criando}
          onClick={() => void criar()}
        >
          {criando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          Registrar entrega
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900">2. Acompanhar gripagem na loja</h2>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-green-700 flex items-center gap-1 font-medium">
              <Radio className="w-3 h-3" aria-hidden />
              Ao vivo
            </span>
            {ultimaSync && (
              <span className="text-[11px] text-gray-400">
                {ultimaSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              className="text-xs text-gray-600 flex items-center gap-1 hover:text-gray-900"
              onClick={() => void recarregarPaineis(origemId)}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Quando a loja bipar um balde, esta lista atualiza na hora (sem precisar recarregar a página).
        </p>

        {entregas.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhuma entrega registrada nas últimas 48 h. Use o formulário acima ao deixar baldes na loja.
          </p>
        ) : (
          <>
            {entregasAbertas.length > 0 && (
              <p className="text-xs font-medium text-amber-800">
                {entregasAbertas.length} entrega(s) aguardando bip na loja
              </p>
            )}
            <ul className="space-y-2">
              {entregas.map((e) => (
                <EntregaConferenciaCard key={e.id} entrega={e} onCancelar={(id) => void cancelarEnvio(id)} />
              ))}
            </ul>
          </>
        )}
      </div>

      <details className="group bg-white rounded-xl border border-gray-200 mb-5 overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center gap-2 px-5 py-3 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
          <Truck className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">Demanda das lojas (mínimos)</span>
          <ChevronDown className="w-4 h-4 ml-auto text-gray-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 pt-0 space-y-3 border-t border-gray-100">
          {demanda.length === 0 ? (
            <p className="text-sm text-gray-500 pt-3">
              Nenhuma loja com falta cadastrada em Reposição. Você pode registrar a entrega manualmente
              acima.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 pt-3">
              <table className="min-w-[520px] w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="py-1 px-2 font-medium">Loja</th>
                    <th className="py-1 px-2 font-medium">Produto</th>
                    <th className="py-1 px-2 font-medium text-right">Falta</th>
                    <th className="py-1 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {demanda.map((row) => (
                    <tr key={`${row.lojaId}|${row.produtoId}`} className="border-b border-gray-100">
                      <td className="py-1.5 px-2">{row.lojaNome}</td>
                      <td className="py-1.5 px-2">{row.produtoNome}</td>
                      <td className="py-1.5 px-2 text-right font-semibold text-red-700">{row.faltante}</td>
                      <td className="py-1.5 px-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => carregarDaDemanda(row)}>
                          Usar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <details className="group bg-white rounded-xl border border-gray-200 overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center gap-2 px-5 py-3 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-gray-800">Bips avulsos (sem registro seu)</span>
          <span className="text-[11px] text-gray-500">— loja bipou sem você registrar quantidade</span>
          <ChevronDown className="w-4 h-4 ml-auto text-gray-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 pt-0 border-t border-gray-100">
          <p className="text-xs text-gray-600 pt-3 mb-2">Últimas 48 h, agrupado por loja + produto.</p>
          {saidasAvulsas.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum bip avulso no período.</p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="min-w-[400px] w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="py-1 px-2">Loja</th>
                    <th className="py-1 px-2">Produto</th>
                    <th className="py-1 px-2 text-right">Baldes</th>
                  </tr>
                </thead>
                <tbody>
                  {saidasAvulsas.map((s) => (
                    <tr key={`${s.destinoId}|${s.produtoId}`} className="border-b border-gray-100">
                      <td className="py-1.5 px-2">{s.destinoNome}</td>
                      <td className="py-1.5 px-2">{s.produtoNome}</td>
                      <td className="py-1.5 px-2 text-right font-semibold">{s.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
