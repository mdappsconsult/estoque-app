'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Radio,
  RefreshCw,
  Store,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  Package,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';
import { formatarDataHoraBr, formatarInstanteConsultaBr } from '@/lib/datas/formatar-auditoria-br';
import { ymdHojeBr } from '@/lib/datas/inicio-dia-br';
import {
  listarPainelRecebimentoLojas,
  type LojaPainelRow,
  type PainelRecebimentoResumo,
  type RemessaPainelRow,
  type TipoFluxoPainel,
} from '@/lib/services/painel-recebimento-lojas';

function labelFluxo(t: TipoFluxoPainel): string {
  if (t === 'gripagem_balde') return 'Gripagem balde';
  if (t === 'balde_avulso') return 'Balde avulso';
  if (t === 'loja_loja') return 'Loja → loja';
  return 'Entrega SEP';
}

function badgeStatusRemessa(r: RemessaPainelRow): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (r.status === 'DELIVERED') return 'success';
  if (r.status === 'DIVERGENCE') return 'error';
  if (r.faltam > 0) return 'warning';
  return 'info';
}

function statusRemessaTexto(s: string): string {
  const m: Record<string, string> = {
    AWAITING_ACCEPT: 'Aguardando',
    ACCEPTED: 'Aceita',
    IN_TRANSIT: 'Em trânsito',
    DELIVERED: 'Concluída',
    DIVERGENCE: 'Divergência',
  };
  return m[s] || s;
}

function RemessaLinha({ r, agoraMs }: { r: RemessaPainelRow; agoraMs: number }) {
  const parado =
    !r.concluida &&
    r.bipados > 0 &&
    r.ultimoBipEm &&
    agoraMs - new Date(r.ultimoBipEm).getTime() > 45 * 60 * 1000;

  return (
    <li
      className={`border rounded-lg px-3 py-2.5 text-sm ${
        r.concluida
          ? 'border-green-100 bg-green-50/40'
          : r.faltam > 0
            ? 'border-amber-200 bg-amber-50/30'
            : 'border-gray-100'
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 truncate">
            {r.produtoNome || 'Vários produtos (SEP)'}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {labelFluxo(r.tipoFluxo)} · {r.origemNome}
          </p>
        </div>
        <div className="text-right tabular-nums">
          <span className={`font-bold ${r.faltam === 0 ? 'text-green-700' : 'text-amber-800'}`}>
            {r.bipados}
          </span>
          <span className="text-gray-400"> / </span>
          <span>{r.totalEsperado}</span>
        </div>
      </div>
      <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden" aria-hidden>
        <div
          className={`h-full rounded-full ${r.pct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${r.pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge variant={badgeStatusRemessa(r)}>{statusRemessaTexto(r.status)}</Badge>
        {r.faltam > 0 && !r.concluida ? (
          <span className="text-xs text-amber-900 font-medium">Faltam {r.faltam}</span>
        ) : r.concluida ? (
          <span className="text-xs text-green-800">Completo</span>
        ) : null}
        {parado ? (
          <span className="text-xs text-red-700 flex items-center gap-0.5">
            <AlertTriangle className="w-3 h-3" /> Sem bip há +45 min
          </span>
        ) : null}
        <span className="text-[11px] text-gray-400 ml-auto">
          {formatarDataHoraBr(r.criadoEm)}
          {r.ultimoBipEm ? ` · último bip ${formatarDataHoraBr(r.ultimoBipEm)}` : ''}
        </span>
      </div>
    </li>
  );
}

function LojaCard({
  loja,
  expandida,
  onToggle,
  agoraMs,
}: {
  loja: LojaPainelRow;
  expandida: boolean;
  onToggle: () => void;
  agoraMs: number;
}) {
  const pct =
    loja.totalEsperado > 0
      ? Math.min(100, Math.round((loja.bipados / loja.totalEsperado) * 100))
      : 0;

  const gripagem = loja.remessas.filter((r) => r.tipoFluxo === 'gripagem_balde');
  const sep = loja.remessas.filter((r) => r.tipoFluxo === 'sep');
  const avulsos = loja.remessas.filter((r) => r.tipoFluxo === 'balde_avulso');
  const outras = loja.remessas.filter(
    (r) => !['gripagem_balde', 'sep', 'balde_avulso'].includes(r.tipoFluxo)
  );

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        loja.temPendencia ? 'border-amber-300 shadow-sm' : 'border-gray-200'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-white hover:bg-gray-50 transition-colors"
      >
        {expandida ? (
          <ChevronDown className="w-5 h-5 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
        )}
        <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
          <Store className="w-4 h-4 text-green-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">{loja.lojaNome}</p>
          <p className="text-xs text-gray-500">
            {loja.remessas.length} remessa(s)
            {loja.remessasAbertas > 0 ? ` · ${loja.remessasAbertas} em andamento` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold tabular-nums leading-tight">
            <span className={loja.faltam === 0 ? 'text-green-700' : 'text-amber-800'}>
              {loja.bipados}
            </span>
            <span className="text-gray-400 font-normal text-sm"> / </span>
            <span className="text-gray-800 text-sm">{loja.totalEsperado}</span>
          </p>
          <p className="text-[10px] text-gray-500">bipados</p>
        </div>
        {loja.temPendencia ? (
          <span className="shrink-0">
            <Badge variant="warning">Falta {loja.faltam}</Badge>
          </span>
        ) : (
          <span className="shrink-0">
            <Badge variant="success">OK</Badge>
          </span>
        )}
      </button>

      <div className="h-1 bg-gray-100 mx-4 mb-0" aria-hidden>
        <div
          className={`h-full ${pct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {expandida && (
        <div className="px-4 pb-4 pt-3 space-y-4 bg-gray-50/80 border-t border-gray-100">
          {loja.operadores.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Quem está bipando nesta loja
              </p>
              <ul className="flex flex-wrap gap-2">
                {loja.operadores.map((op) => (
                  <li
                    key={op.usuarioId}
                    className="text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1"
                  >
                    <span className="font-medium text-gray-900">{op.nome}</span>
                    <span className="text-gray-500"> · {op.quantidade} bip(s)</span>
                    {op.ultimoBipEm ? (
                      <span className="text-gray-400"> · {formatarDataHoraBr(op.ultimoBipEm)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {gripagem.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-sky-800 mb-2">Baldes — gripagem (envio direto)</p>
              <ul className="space-y-2">
                {gripagem.map((r) => (
                  <RemessaLinha key={r.id} r={r} agoraMs={agoraMs} />
                ))}
              </ul>
            </div>
          )}

          {sep.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-indigo-800 mb-2">Produtos — entrega SEP / indústria</p>
              <ul className="space-y-2">
                {sep.map((r) => (
                  <RemessaLinha key={r.id} r={r} agoraMs={agoraMs} />
                ))}
              </ul>
            </div>
          )}

          {avulsos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">
                Baldes avulsos ({avulsos.length})
              </p>
              <p className="text-xs text-gray-500 mb-2">
                Entrada sem quantidade combinada — cada balde fecha uma remessa de 1 unidade.
              </p>
              <ul className="space-y-2">
                {avulsos.slice(0, 8).map((r) => (
                  <RemessaLinha key={r.id} r={r} agoraMs={agoraMs} />
                ))}
                {avulsos.length > 8 ? (
                  <li className="text-xs text-gray-500">+ {avulsos.length - 8} avulsos…</li>
                ) : null}
              </ul>
            </div>
          )}

          {outras.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Outras transferências</p>
              <ul className="space-y-2">
                {outras.map((r) => (
                  <RemessaLinha key={r.id} r={r} agoraMs={agoraMs} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PainelRecebimentoLojasPage() {
  const [janela, setJanela] = useState<'hoje' | '48h'>('hoje');
  const [filtroLoja, setFiltroLoja] = useState('');
  const [somentePendencia, setSomentePendencia] = useState(true);
  const [painel, setPainel] = useState<PainelRecebimentoResumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({});

  const recarregar = useCallback(async () => {
    try {
      const dados = await listarPainelRecebimentoLojas(janela);
      setPainel(dados);
      setUltimaSync(new Date());
      setErro('');
    } catch (e) {
      setErro(errMessage(e, 'Falha ao carregar o painel.'));
    }
  }, [janela]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      await recarregar();
      if (ativo) setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, [recarregar]);

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void recarregar();
      }, 250);
    };

    const channel = supabase
      .channel('painel-recebimento-lojas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencia_itens' },
        () => refetch()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencias' },
        () => refetch()
      )
      .subscribe();

    const fallback = window.setInterval(() => void recarregar(), 60000);

    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
      window.clearInterval(fallback);
    };
  }, [recarregar]);

  const lojasFiltradas = useMemo(() => {
    if (!painel) return [];
    let lista = painel.lojas;
    if (filtroLoja) lista = lista.filter((l) => l.lojaId === filtroLoja);
    if (somentePendencia) lista = lista.filter((l) => l.temPendencia);
    return lista;
  }, [painel, filtroLoja, somentePendencia]);

  const opcoesLoja = useMemo(() => {
    if (!painel) return [{ value: '', label: 'Todas as lojas' }];
    return [
      { value: '', label: 'Todas as lojas' },
      ...painel.lojas.map((l) => ({ value: l.lojaId, label: l.lojaNome })),
    ];
  }, [painel]);

  const toggleLoja = (id: string) =>
    setExpandidas((prev) => ({ ...prev, [id]: !prev[id] }));

  const expandirTodasPendentes = () => {
    if (!painel) return;
    const next: Record<string, boolean> = {};
    for (const l of painel.lojas.filter((x) => x.temPendencia)) {
      next[l.lojaId] = true;
    }
    setExpandidas(next);
  };

  if (carregando && !painel) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  const totais = painel?.totais;
  const diaLabel = janela === 'hoje' ? ymdHojeBr() : 'últimas 48 h';
  const agoraMs =
    ultimaSync?.getTime() ??
    (painel?.consultadoEm ? new Date(painel.consultadoEm).getTime() : 0);

  return (
    <div className="max-w-3xl mx-auto px-1 sm:px-0 pb-8">
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
          <Store className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Entrada nas lojas — ao vivo</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Acompanhe gripagem de baldes e bipagem de produtos (SEP) em todas as lojas. Veja o que
            falta bipar e quem está conferindo.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
          <Radio className="w-3.5 h-3.5 text-green-600 animate-pulse" />
          <span>Ao vivo</span>
          {ultimaSync ? (
            <span className="text-gray-400">
              · {ultimaSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          ) : null}
        </div>
      </div>

      {erro ? (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {erro}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-5 space-y-3">
        <p className="text-xs text-gray-500">
          Consulta: <strong>{formatarInstanteConsultaBr()}</strong> · período: <strong>{diaLabel}</strong>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
            <p className="text-[11px] text-amber-800 font-medium">Falta bipar</p>
            <p className="text-2xl font-bold text-amber-900 tabular-nums">{totais?.faltam ?? 0}</p>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
            <p className="text-[11px] text-blue-800 font-medium">Já bipados</p>
            <p className="text-2xl font-bold text-blue-900 tabular-nums">{totais?.bipados ?? 0}</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-[11px] text-gray-600 font-medium">Lojas com pendência</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {totais?.lojasComPendencia ?? 0}
              <span className="text-sm font-normal text-gray-500"> / {totais?.lojasAtivas ?? 0}</span>
            </p>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-100 p-3">
            <p className="text-[11px] text-green-800 font-medium">Remessas concluídas</p>
            <p className="text-2xl font-bold text-green-900 tabular-nums">
              {totais?.remessasConcluidas ?? 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <Select
            label="Período"
            options={[
              { value: 'hoje', label: 'Hoje (dia BR)' },
              { value: '48h', label: 'Últimas 48 horas' },
            ]}
            value={janela}
            onChange={(e) => setJanela(e.target.value as 'hoje' | '48h')}
          />
          <Select label="Loja" options={opcoesLoja} value={filtroLoja} onChange={(e) => setFiltroLoja(e.target.value)} />
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={somentePendencia}
                onChange={(e) => setSomentePendencia(e.target.checked)}
                className="rounded border-gray-300"
              />
              Só lojas com falta de bip
            </label>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void recarregar()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
              </Button>
              <Button variant="outline" size="sm" onClick={expandirTodasPendentes}>
                Expandir pendentes
              </Button>
            </div>
          </div>
        </div>
      </div>

      {painel && painel.operadoresRede.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" /> Equipe na rede hoje (por volume de bip)
          </p>
          <ul className="flex flex-wrap gap-2">
            {painel.operadoresRede.slice(0, 12).map((op) => (
              <li
                key={op.usuarioId}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50"
              >
                <span className="font-medium">{op.nome}</span>
                <span className="text-gray-600"> — {op.quantidade} bip(s)</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-500 mt-2">
            Compare lojas: se uma loja tem muita falta e poucos bips de ajudantes, pode faltar gente
            no recebimento ou remessa errada selecionada.
          </p>
        </div>
      )}

      {lojasFiltradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          {somentePendencia ? (
            <>
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="font-medium text-gray-900">Nenhuma loja com pendência no filtro atual</p>
              <p className="text-sm text-gray-500 mt-1">
                Todas as entradas do período foram bipadas ou não há remessas hoje.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSomentePendencia(false)}
              >
                Ver todas as lojas com atividade
              </Button>
            </>
          ) : (
            <>
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-900">Sem entradas registradas no período</p>
              <p className="text-sm text-gray-500 mt-1">
                Quando houver separação SEP, envio direto ou gripagem, aparece aqui em tempo real.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {lojasFiltradas.map((loja) => (
            <LojaCard
              key={loja.lojaId}
              loja={loja}
              expandida={Boolean(expandidas[loja.lojaId])}
              onToggle={() => toggleLoja(loja.lojaId)}
              agoraMs={agoraMs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
