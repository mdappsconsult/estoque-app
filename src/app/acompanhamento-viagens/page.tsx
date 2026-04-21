'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Loader2, MapPin, Truck } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';

type ViagemRow = {
  id: string;
  status: string;
  motorista_id: string | null;
  created_at: string;
  motorista?: { nome: string } | null;
};

type TransRow = {
  id: string;
  status: string;
  created_at: string;
  destino_id: string | null;
  origem_id: string | null;
  destino?: { id: string; nome: string } | { id: string; nome: string }[] | null;
  origem?: { id: string; nome: string } | { id: string; nome: string }[] | null;
};

function joinUm<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function nomeLocal(v: TransRow['destino'] | TransRow['origem']): string | null {
  const o = joinUm(v);
  return o?.nome?.trim() || null;
}

function statusViagemLabel(s: string): string {
  const m: Record<string, string> = {
    PENDING: 'Pendente',
    ACCEPTED: 'Aceita',
    IN_TRANSIT: 'Em trânsito',
    COMPLETED: 'Concluída',
  };
  return m[s] || s;
}

function badgeViagemVariant(s: string): 'default' | 'success' | 'warning' | 'info' {
  const m: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
    PENDING: 'warning',
    ACCEPTED: 'info',
    IN_TRANSIT: 'info',
    COMPLETED: 'success',
  };
  return m[s] || 'default';
}

function statusRemessaLabel(s: string): string {
  const m: Record<string, string> = {
    AWAITING_ACCEPT: 'Aguardando aceite',
    ACCEPTED: 'Aceita',
    IN_TRANSIT: 'Em trânsito',
    DELIVERED: 'Entregue',
    DIVERGENCE: 'Divergência',
  };
  return m[s] || s;
}

function badgeRemessaVariant(s: string): 'default' | 'success' | 'warning' | 'info' | 'error' {
  const m: Record<string, 'default' | 'success' | 'warning' | 'info' | 'error'> = {
    AWAITING_ACCEPT: 'warning',
    ACCEPTED: 'info',
    IN_TRANSIT: 'info',
    DELIVERED: 'success',
    DIVERGENCE: 'error',
  };
  return m[s] || 'default';
}

function isChegouNaLojaRemessa(s: string): boolean {
  return s === 'DELIVERED';
}

function isConcluidaRemessa(s: string): boolean {
  return s === 'DELIVERED' || s === 'DIVERGENCE';
}

function isPendenteRemessa(s: string): boolean {
  return !isConcluidaRemessa(s);
}

function diasAtrasIso(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

const SELECT_TRANS_MIN = `
  id,
  status,
  created_at,
  destino_id,
  origem_id,
  destino:locais!destino_id(id, nome),
  origem:locais!origem_id(id, nome)
`;

export default function AcompanhamentoViagensPage() {
  const [dias, setDias] = useState<'7' | '14' | '30'>('14');
  const [filtroStatus, setFiltroStatus] = useState<'pendentes' | 'concluidas' | 'todas'>('pendentes');
  const [destinoId, setDestinoId] = useState<string>('');
  const [expandida, setExpandida] = useState<Record<string, boolean>>({});

  const createdAtGte = useMemo(() => diasAtrasIso(Number(dias)), [dias]);
  const filtrosViagem = useMemo(
    () => [{ column: 'created_at' as const, operator: 'gte' as const, value: createdAtGte }],
    [createdAtGte]
  );

  const {
    data: viagens,
    loading,
    error: viagensError,
  } = useRealtimeQuery<ViagemRow>({
    table: 'viagens',
    select: 'id, status, motorista_id, created_at, motorista:usuarios!motorista_id(nome)',
    orderBy: { column: 'created_at', ascending: false },
    maxRows: 400,
    preserveDataWhileRefetching: true,
    filters: filtrosViagem,
  });

  const [transByViagem, setTransByViagem] = useState<Record<string, TransRow[]>>({});
  const [loadingTrans, setLoadingTrans] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!viagens.length) {
        setTransByViagem({});
        return;
      }
      setLoadingTrans(true);
      try {
        const settled = await Promise.allSettled(
          viagens.map(async (v) => {
            const { data, error } = await supabase
              .from('transferencias')
              .select(SELECT_TRANS_MIN)
              .eq('viagem_id', v.id);
            if (error) throw error;
            return [v.id, (data || []) as unknown as TransRow[]] as const;
          })
        );
        if (cancel) return;
        const map: Record<string, TransRow[]> = {};
        for (let i = 0; i < settled.length; i++) {
          const r = settled[i];
          const vid = viagens[i].id;
          if (r.status === 'fulfilled') {
            map[r.value[0]] = r.value[1];
          } else {
            map[vid] = [];
            console.warn('[acompanhamento-viagens] transferencias:', vid, errMessage(r.reason, String(r.reason)));
          }
        }
        setTransByViagem(map);
      } catch (e: unknown) {
        if (!cancel) setTransByViagem({});
        console.warn('[acompanhamento-viagens] carregar:', errMessage(e, String(e)));
      } finally {
        if (!cancel) setLoadingTrans(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [viagens]);

  const destinosOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const rows of Object.values(transByViagem)) {
      for (const t of rows) {
        const did = String(t.destino_id || '').trim();
        if (!did) continue;
        const nome = nomeLocal(t.destino) || did.slice(0, 8).toUpperCase();
        map.set(did, nome);
      }
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [transByViagem]);

  const viagensFiltradas = useMemo(() => {
    const out: Array<ViagemRow & { remessas: TransRow[] }> = [];
    for (const v of viagens) {
      const remessas = transByViagem[v.id] || [];
      const remessasFiltradasPorDestino = destinoId ? remessas.filter((t) => t.destino_id === destinoId) : remessas;
      if (filtroStatus === 'concluidas') {
        if (remessasFiltradasPorDestino.length > 0 && remessasFiltradasPorDestino.every((t) => isConcluidaRemessa(t.status))) {
          out.push({ ...v, remessas: remessasFiltradasPorDestino });
        }
      } else if (filtroStatus === 'pendentes') {
        if (remessasFiltradasPorDestino.some((t) => isPendenteRemessa(t.status))) {
          out.push({ ...v, remessas: remessasFiltradasPorDestino });
        }
      } else {
        out.push({ ...v, remessas: remessasFiltradasPorDestino });
      }
    }
    return out;
  }, [viagens, transByViagem, destinoId, filtroStatus]);

  const toggleExpand = (id: string) => setExpandida((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="max-w-3xl mx-auto px-1 sm:px-0">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Acompanhamento de viagens</h1>
          <p className="text-sm text-gray-500">
            Acompanhe se as remessas foram <strong>entregues</strong> na loja e se a sequência está concluída.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Período"
            options={[
              { value: '7', label: 'Últimos 7 dias' },
              { value: '14', label: 'Últimos 14 dias' },
              { value: '30', label: 'Últimos 30 dias' },
            ]}
            value={dias}
            onChange={(e) => setDias(e.target.value as '7' | '14' | '30')}
          />
          <Select
            label="Mostrar"
            options={[
              { value: 'pendentes', label: 'Com pendência' },
              { value: 'concluidas', label: 'Concluídas' },
              { value: 'todas', label: 'Todas' },
            ]}
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as 'pendentes' | 'concluidas' | 'todas')}
          />
          <Select
            label="Destino (loja)"
            options={[{ value: '', label: 'Todas' }, ...destinosOptions]}
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
          />
        </div>

        <div className="text-xs text-gray-600 leading-relaxed rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          <p>
            <strong>Chegou na loja:</strong> remessa com status <code className="rounded bg-white px-1">DELIVERED</code>.
          </p>
          <p className="mt-1">
            <strong>Concluída:</strong> todas as remessas da viagem estão em{' '}
            <code className="rounded bg-white px-1">DELIVERED</code> ou{' '}
            <code className="rounded bg-white px-1">DIVERGENCE</code>.
          </p>
        </div>
      </div>

      {viagensError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errMessage(viagensError, 'Erro ao carregar viagens')}
        </div>
      )}

      {(loading || loadingTrans) && viagensFiltradas.length === 0 ? (
        <div className="flex items-center gap-2 text-gray-600 text-sm py-10">
          <Loader2 className="w-4 h-4 animate-spin text-red-500" />
          Carregando viagens e remessas…
        </div>
      ) : viagensFiltradas.length === 0 ? (
        <div className="text-center py-10 text-gray-400 px-2">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium text-gray-600">Nenhuma viagem encontrada</p>
          <p className="text-sm text-gray-500 mt-1">Ajuste os filtros para ampliar o período.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {viagensFiltradas.map((v) => {
            const remessas = v.remessas;
            const total = remessas.length;
            const entregues = remessas.filter((t) => isChegouNaLojaRemessa(t.status)).length;
            const divergencias = remessas.filter((t) => t.status === 'DIVERGENCE').length;
            const pendentes = remessas.filter((t) => isPendenteRemessa(t.status)).length;
            const concluida = total > 0 && remessas.every((t) => isConcluidaRemessa(t.status));

            const destinos = Array.from(
              new Set(remessas.map((t) => nomeLocal(t.destino)).filter((x): x is string => Boolean(x)))
            );

            return (
              <div key={v.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpand(v.id)}
                  className="w-full px-4 py-3.5 flex items-start justify-between gap-3 text-left hover:bg-gray-50 transition-colors"
                  aria-expanded={Boolean(expandida[v.id])}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-gray-500" />
                      Viagem · {v.id.slice(0, 8).toUpperCase()}
                      {concluida ? <Badge variant="success" size="sm">Concluída</Badge> : null}
                      {pendentes > 0 ? <Badge variant="warning" size="sm">Pendências</Badge> : null}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(v.created_at).toLocaleString('pt-BR')} · Status viagem: {statusViagemLabel(v.status)}
                      {v.motorista?.nome ? ` · Motorista: ${v.motorista.nome}` : ''}
                    </p>
                    {destinos.length > 0 && (
                      <p className="text-xs text-gray-600 mt-1 flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                        <span className="truncate">Destinos: {destinos.join(' • ')}</span>
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <Badge variant={badgeViagemVariant(v.status)} size="sm">
                      {statusViagemLabel(v.status)}
                    </Badge>
                    <p className="text-xs text-gray-600 mt-2 tabular-nums">
                      Entregues: <span className="font-semibold text-gray-900">{entregues}</span>/{total}
                    </p>
                    {divergencias > 0 && (
                      <p className="text-xs text-gray-600 tabular-nums">
                        Diverg.: <span className="font-semibold text-gray-900">{divergencias}</span>
                      </p>
                    )}
                    {pendentes > 0 && (
                      <p className="text-xs text-gray-600 tabular-nums">
                        Pend.: <span className="font-semibold text-gray-900">{pendentes}</span>
                      </p>
                    )}
                    <div className="mt-2 flex justify-end">
                      {expandida[v.id] ? (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                  </div>
                </button>

                {expandida[v.id] && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                    {remessas.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhuma remessa vinculada a esta viagem.</p>
                    ) : (
                      <div className="space-y-2">
                        {remessas.map((t) => {
                          const dest = nomeLocal(t.destino) || t.destino_id?.slice(0, 8).toUpperCase() || 'Destino';
                          return (
                            <div
                              key={t.id}
                              className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{dest}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Remessa {t.id.slice(0, 8).toUpperCase()} · {new Date(t.created_at).toLocaleString('pt-BR')}
                                </p>
                              </div>
                              <div className="shrink-0 flex flex-col items-end gap-1">
                                <Badge variant={badgeRemessaVariant(t.status)} size="sm">
                                  {statusRemessaLabel(t.status)}
                                </Badge>
                                {isChegouNaLojaRemessa(t.status) ? (
                                  <span className="text-[11px] text-green-700 font-medium">Chegou na loja</span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

