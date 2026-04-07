'use client';

import {
  Loader2,
  Truck,
  CheckCircle,
  Play,
  ChevronDown,
  ChevronRight,
  Package,
  MapPin,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { aceitarViagem, iniciarViagem } from '@/lib/services/viagens';
import { supabase } from '@/lib/supabase';
import { useState, useEffect, useCallback } from 'react';
import { errMessage } from '@/lib/errMessage';

interface ViagemRow {
  id: string;
  status: string;
  motorista_id: string | null;
  created_at: string;
  motorista?: { nome: string } | null;
}

type LocalNome = { nome: string } | null | { nome: string }[];

type ItemJoin = {
  id?: string;
  token_qr?: string;
  token_short?: string | null;
  produto?: { nome?: string } | { nome?: string }[] | null;
};

interface TiRow {
  id: string;
  item?: ItemJoin | ItemJoin[] | null;
}

interface TransRow {
  id: string;
  status: string;
  origem: LocalNome;
  destino: LocalNome;
  transferencia_itens: TiRow[];
}

function joinUm<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function localNome(d: LocalNome): string | undefined {
  const o = joinUm(d);
  return o?.nome;
}

function normItem(ti: TiRow['item']): ItemJoin | null {
  return joinUm(ti);
}

function nomeProdutoDoItem(it: ItemJoin | null): string {
  if (!it?.produto) return 'Produto';
  const p = joinUm(it.produto);
  return p?.nome?.trim() || 'Produto';
}

function agregarProdutosPorNome(itens: TiRow[]): { nome: string; qtd: number }[] {
  const map = new Map<string, number>();
  for (const ti of itens) {
    const it = normItem(ti.item);
    const nome = nomeProdutoDoItem(it);
    map.set(nome, (map.get(nome) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([nome, qtd]) => ({ nome, qtd }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

const SELECT_TRANS_VIAGEM = `
  id,
  status,
  origem:locais!origem_id(nome),
  destino:locais!destino_id(nome),
  transferencia_itens(
    id,
    item:itens!item_id(id, token_qr, token_short, produto:produtos(nome))
  )
`;

function statusTransferenciaLegivel(s: string): string {
  const m: Record<string, string> = {
    AWAITING_ACCEPT: 'Aguardando aceite da loja',
    ACCEPTED: 'Aceita — aguardando despacho',
    IN_TRANSIT: 'Em trânsito',
    DELIVERED: 'Entregue',
    DIVERGENCE: 'Divergência',
  };
  return m[s] || s;
}

export default function ViagemAceitePage() {
  const { usuario } = useAuth();
  const { data: viagens, loading } = useRealtimeQuery<ViagemRow>({
    table: 'viagens',
    select: '*, motorista:usuarios!motorista_id(nome)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const [transMap, setTransMap] = useState<Record<string, TransRow[]>>({});
  const [loadingTrans, setLoadingTrans] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  /** Viagens com painel de detalhes aberto */
  const [viagemExpandida, setViagemExpandida] = useState<Record<string, boolean>>({});
  /** Por viagem, qual remessa (transferência) está expandida para ver lista unitária */
  const [remessaExpandida, setRemessaExpandida] = useState<Record<string, string | null>>({});

  const carregarTransferencias = useCallback(async () => {
    if (viagens.length === 0) {
      setTransMap({});
      return;
    }
    setLoadingTrans(true);
    try {
      const entradas = await Promise.all(
        viagens.map(async (v) => {
          const { data, error } = await supabase
            .from('transferencias')
            .select(SELECT_TRANS_VIAGEM)
            .eq('viagem_id', v.id);
          if (error) throw error;
          return [v.id, (data || []) as unknown as TransRow[]] as const;
        })
      );
      const map: Record<string, TransRow[]> = {};
      for (const [id, rows] of entradas) {
        map[id] = rows;
      }
      setTransMap(map);
    } catch {
      setTransMap({});
    } finally {
      setLoadingTrans(false);
    }
  }, [viagens]);

  useEffect(() => {
    void carregarTransferencias();
  }, [carregarTransferencias]);

  const toggleViagemDetalhes = (viagemId: string) => {
    setViagemExpandida((prev) => ({ ...prev, [viagemId]: !prev[viagemId] }));
  };

  const toggleRemessaItens = (viagemId: string, transferId: string) => {
    setRemessaExpandida((prev) => ({
      ...prev,
      [viagemId]: prev[viagemId] === transferId ? null : transferId,
    }));
  };

  const handleAceitar = async (viagemId: string) => {
    if (!usuario) return;
    const confirmou = window.confirm('Confirmar aceite desta viagem?');
    if (!confirmou) return;
    setLoadingAction(viagemId);
    try {
      await aceitarViagem(viagemId, usuario.id);
    } catch (err: unknown) {
      alert(errMessage(err, 'Erro'));
    }
    setLoadingAction(null);
  };

  const handleIniciar = async (viagemId: string) => {
    if (!usuario) return;
    const confirmou = window.confirm('Confirmar início desta viagem?');
    if (!confirmou) return;
    setLoadingAction(viagemId);
    try {
      await iniciarViagem(viagemId, usuario.id);
    } catch (err: unknown) {
      alert(errMessage(err, 'Erro'));
    }
    setLoadingAction(null);
  };

  const statusBadge = (s: string) => {
    const m: Record<string, 'warning' | 'info' | 'success' | 'default'> = {
      PENDING: 'warning',
      ACCEPTED: 'info',
      IN_TRANSIT: 'info',
      COMPLETED: 'success',
    };
    return m[s] || 'default';
  };
  const statusLabel = (s: string) => {
    const m: Record<string, string> = {
      PENDING: 'Aguardando você aceitar',
      ACCEPTED: 'Aceita — pode iniciar',
      IN_TRANSIT: 'Em trânsito',
      COMPLETED: 'Concluída',
    };
    return m[s] || s;
  };

  const resumoDestinos = (trans: TransRow[]): string => {
    const nomes = Array.from(
      new Set(
        trans.map((t) => localNome(t.destino)).filter((nome): nome is string => Boolean(nome))
      )
    );
    if (nomes.length === 0) return 'Destino não informado';
    return nomes.join(' • ');
  };

  const primeiraOrigem = (trans: TransRow[]): string | undefined => {
    for (const t of trans) {
      const n = localNome(t.origem);
      if (n) return n;
    }
    return undefined;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  const viagensPendentes = viagens.filter((v) => v.status === 'PENDING' || v.status === 'ACCEPTED');
  const viagensHist = viagens.filter((v) => v.status === 'IN_TRANSIT' || v.status === 'COMPLETED');

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Truck className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Viagens / Aceite</h1>
          <p className="text-sm text-gray-500">
            Confira origem, lojas de destino e o que vai em cada remessa antes de aceitar ou iniciar.
          </p>
        </div>
      </div>

      {viagensPendentes.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhuma viagem pendente</p>
        </div>
      )}

      <div className="space-y-4">
        {viagensPendentes.map((v) => {
          const trans = transMap[v.id] || [];
          const totalItens = trans.reduce((acc, t) => acc + (t.transferencia_itens?.length || 0), 0);
          const origem = primeiraOrigem(trans);
          const expandido = Boolean(viagemExpandida[v.id]);
          const idCurto = v.id.slice(0, 8).toUpperCase();

          return (
            <div key={v.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">Viagem · código {idCurto}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Criada em {new Date(v.created_at).toLocaleString('pt-BR')}
                    </p>
                    {v.motorista?.nome && (
                      <p className="text-xs text-gray-600 mt-1">Motorista: {v.motorista.nome}</p>
                    )}
                  </div>
                  <Badge variant={statusBadge(v.status)}>{statusLabel(v.status)}</Badge>
                </div>

                {loadingTrans && trans.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    Carregando remessas…
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 space-y-1.5 text-sm text-gray-700 mb-3">
                      {origem && (
                        <p className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                          <span>
                            <span className="text-gray-500">Origem:</span> {origem}
                          </span>
                        </p>
                      )}
                      <p className="flex items-start gap-2">
                        <Package className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                        <span>
                          <span className="text-gray-500">Resumo:</span>{' '}
                          {trans.length === 0
                            ? 'Nenhuma remessa vinculada'
                            : `${trans.length} remessa(s) · ${totalItens} unidade(s) no total`}
                        </span>
                      </p>
                      {trans.length > 0 && (
                        <p className="text-xs text-gray-600 pl-6 leading-snug">
                          Lojas: <span className="font-medium text-gray-800">{resumoDestinos(trans)}</span>
                        </p>
                      )}
                    </div>

                    {trans.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleViagemDetalhes(v.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                      >
                        <span>{expandido ? 'Ocultar' : 'Ver'} produtos por remessa</span>
                        {expandido ? (
                          <ChevronDown className="w-5 h-5 text-gray-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
                        )}
                      </button>
                    )}
                  </>
                )}

                {expandido && trans.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    {trans.map((t, idx) => {
                      const dest = localNome(t.destino) ?? 'Destino';
                      const itens = t.transferencia_itens || [];
                      const agregados = agregarProdutosPorNome(itens);
                      const aberta = remessaExpandida[v.id] === t.id;

                      return (
                        <div
                          key={t.id}
                          className="rounded-lg border border-gray-200 bg-gray-50/80 overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => toggleRemessaItens(v.id, t.id)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-100/80 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                Remessa {idx + 1} → {dest}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {itens.length} unidade(s) · {statusTransferenciaLegivel(t.status)}
                              </p>
                            </div>
                            {aberta ? (
                              <ChevronDown className="w-5 h-5 text-gray-500 shrink-0" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
                            )}
                          </button>

                          {!aberta && agregados.length > 0 && (
                            <div className="px-3 pb-2.5 pt-0">
                              <p className="text-xs font-medium text-gray-500 mb-1">Resumo por produto</p>
                              <ul className="text-xs text-gray-700 space-y-0.5">
                                {agregados.map((a) => (
                                  <li key={a.nome}>
                                    {a.nome}
                                    {a.qtd > 1 ? <span className="text-gray-500"> × {a.qtd}</span> : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {aberta && (
                            <div className="border-t border-gray-200 bg-white px-3 py-2 max-h-48 overflow-y-auto">
                              <p className="text-xs font-medium text-gray-500 mb-1.5">Cada unidade (QR)</p>
                              <ul className="text-xs text-gray-700 space-y-1 font-mono">
                                {itens.map((ti) => {
                                  const it = normItem(ti.item);
                                  const nome = nomeProdutoDoItem(it);
                                  const cod =
                                    (it?.token_short && String(it.token_short)) ||
                                    (it?.token_qr && it.token_qr.length > 12
                                      ? `…${it.token_qr.slice(-8)}`
                                      : it?.token_qr) ||
                                    '—';
                                  return (
                                    <li key={ti.id} className="flex justify-between gap-2 border-b border-gray-50 pb-1 last:border-0">
                                      <span className="text-gray-800 font-sans truncate">{nome}</span>
                                      <span className="text-gray-500 shrink-0 tabular-nums">{cod}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="px-4 pb-4">
                {v.status === 'PENDING' && (
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => handleAceitar(v.id)}
                    disabled={loadingAction === v.id}
                  >
                    {loadingAction === v.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Aceitar viagem
                  </Button>
                )}
                {v.status === 'ACCEPTED' && v.motorista_id === usuario?.id && (
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => handleIniciar(v.id)}
                    disabled={loadingAction === v.id}
                  >
                    {loadingAction === v.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Iniciar viagem
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {viagensHist.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-700 mt-8 mb-4">Histórico</h2>
          <div className="space-y-2">
            {viagensHist.slice(0, 10).map((v) => {
              const trans = transMap[v.id] || [];
              const totalItens = trans.reduce((acc, t) => acc + (t.transferencia_itens?.length || 0), 0);
              const idCurto = v.id.slice(0, 8).toUpperCase();
              return (
                <div
                  key={v.id}
                  className="bg-white rounded-xl border border-gray-200 p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700">Viagem · {idCurto}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      Lojas: {resumoDestinos(trans)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {trans.length} remessa(s) · {totalItens} unidades ·{' '}
                      {new Date(v.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Badge variant={statusBadge(v.status)} size="sm">
                    {statusLabel(v.status)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
