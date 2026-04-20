'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  CheckCircle,
  Search,
  ChevronDown,
  ChevronRight,
  Package,
  Warehouse,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import {
  listarDivergenciasAdmin,
  listarRemessasParaFiltroDivergencias,
  resolverDivergencia,
  type DivergenciaAdminRow,
  type RemessaDivergenciaOption,
} from '@/lib/services/divergencias';
import { getLocais } from '@/lib/services/locais';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';
import type { Local } from '@/types/database';

function joinUm<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function normTransf(
  t: DivergenciaAdminRow['transferencia']
): NonNullable<DivergenciaAdminRow['transferencia']> | null {
  return joinUm(t as unknown as NonNullable<DivergenciaAdminRow['transferencia']> | NonNullable<DivergenciaAdminRow['transferencia']>[]);
}

function tokenCurto(d: DivergenciaAdminRow): string {
  const it = d.item;
  if (it?.token_short && String(it.token_short).trim()) return String(it.token_short);
  const q = it?.token_qr;
  if (q && q.length > 12) return `…${q.slice(-8)}`;
  return q || '—';
}

export default function DivergenciasPage() {
  const { usuario } = useAuth();
  const [divergencias, setDivergencias] = useState<DivergenciaAdminRow[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<'abertas' | 'resolvidas' | 'todas'>('abertas');
  const [destinoId, setDestinoId] = useState<string>('');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'FALTANTE' | 'EXCEDENTE'>('todos');
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [remessaUuid, setRemessaUuid] = useState('');
  const [remessaOpcoes, setRemessaOpcoes] = useState<RemessaDivergenciaOption[]>([]);
  const [agruparRemessa, setAgruparRemessa] = useState(true);
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [entradaLoadingId, setEntradaLoadingId] = useState<string | null>(null);
  const [resolverErro, setResolverErro] = useState<string | null>(null);
  const [entradaModal, setEntradaModal] = useState<DivergenciaAdminRow | null>(null);
  const [entradaLogin, setEntradaLogin] = useState('');
  const [entradaSenha, setEntradaSenha] = useState('');
  const [entradaErro, setEntradaErro] = useState<string | null>(null);
  const carregarRef = useRef<() => Promise<void>>(async () => {});
  const loadOpcoesRemessasRef = useRef<() => Promise<void>>(async () => {});

  const loadOpcoesRemessas = useCallback(async () => {
    try {
      const op = await listarRemessasParaFiltroDivergencias({
        destinoId: destinoId || null,
        limite: 180,
      });
      setRemessaOpcoes(op);
      setRemessaUuid((prev) => (prev && op.some((o) => o.id === prev) ? prev : ''));
    } catch {
      setRemessaOpcoes([]);
      setRemessaUuid('');
    }
  }, [destinoId]);

  loadOpcoesRemessasRef.current = loadOpcoesRemessas;

  const carregar = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const uuidTrim = remessaUuid.trim();
      const uuidOk =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidTrim);

      const rows = await listarDivergenciasAdmin({
        situacao,
        destinoId: destinoId || null,
        tipo: tipoFiltro === 'todos' ? null : tipoFiltro,
        transferenciaIdExato: uuidOk ? uuidTrim : null,
        buscaTrim: buscaDebounced,
        limite: 800,
      });
      setDivergencias(rows);
    } catch (e: unknown) {
      setDivergencias([]);
      setLoadError(errMessage(e, 'Não foi possível carregar as divergências'));
    } finally {
      setLoading(false);
    }
  }, [situacao, destinoId, tipoFiltro, remessaUuid, buscaDebounced]);

  carregarRef.current = carregar;

  useEffect(() => {
    const t = window.setTimeout(() => setBuscaDebounced(busca.trim()), 350);
    return () => window.clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    void getLocais().then(setLocais).catch(() => setLocais([]));
  }, []);

  useEffect(() => {
    void loadOpcoesRemessas();
  }, [loadOpcoesRemessas]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!entradaModal) return;
    const op = usuario?.login_operacional?.trim();
    setEntradaLogin(op ?? '');
    setEntradaSenha('');
    setEntradaErro(null);
  }, [entradaModal, usuario?.login_operacional]);

  useEffect(() => {
    const ch = supabase
      .channel('divergencias-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'divergencias' },
        () => {
          void carregarRef.current();
          void loadOpcoesRemessasRef.current();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const lojas = useMemo(
    () => locais.filter((l) => l.tipo === 'STORE').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [locais]
  );

  const abertasCount = useMemo(() => divergencias.filter((d) => !d.resolvido).length, [divergencias]);

  const grupos = useMemo(() => {
    const map = new Map<
      string,
      { transId: string; meta: NonNullable<DivergenciaAdminRow['transferencia']> | null; itens: DivergenciaAdminRow[] }
    >();
    for (const d of divergencias) {
      const tid = d.transferencia_id;
      if (!map.has(tid)) {
        map.set(tid, {
          transId: tid,
          meta: normTransf(d.transferencia),
          itens: [],
        });
      }
      map.get(tid)!.itens.push(d);
    }
    const arr = [...map.values()];
    arr.sort((a, b) => {
      const ta = Math.max(...a.itens.map((i) => new Date(i.created_at).getTime()));
      const tb = Math.max(...b.itens.map((i) => new Date(i.created_at).getTime()));
      return tb - ta;
    });
    return arr;
  }, [divergencias]);

  const toggleGrupo = (transId: string) => {
    setExpandidas((p) => ({ ...p, [transId]: !p[transId] }));
  };

  const handleResolver = async (id: string) => {
    if (!usuario) return;
    setResolverErro(null);
    setActionLoading(id);
    try {
      await resolverDivergencia(id, usuario.id);
      await carregar();
    } catch (err: unknown) {
      setResolverErro(errMessage(err, 'Erro ao resolver'));
    }
    setActionLoading(null);
  };

  const handleConfirmarEntradaLoja = async () => {
    if (!entradaModal) return;
    const loginOp = entradaLogin.trim().toLowerCase();
    if (!loginOp) {
      setEntradaErro('Informe o login operacional.');
      return;
    }
    if (!entradaSenha) {
      setEntradaErro('Informe a senha.');
      return;
    }
    setEntradaErro(null);
    setEntradaLoadingId(entradaModal.id);
    try {
      const res = await fetch('/api/operacional/dar-entrada-faltante-divergencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          divergenciaId: entradaModal.id,
          login: loginOp,
          senha: entradaSenha,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || 'Falha ao registrar entrada na loja');
      }
      setEntradaModal(null);
      setEntradaSenha('');
      await carregar();
    } catch (err: unknown) {
      setEntradaErro(errMessage(err, 'Erro ao registrar entrada'));
    } finally {
      setEntradaLoadingId(null);
    }
  };

  const renderLinha = (d: DivergenciaAdminRow) => (
    <div
      key={d.id}
      className="rounded-lg border border-gray-100 bg-white/90 px-3 py-2.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Badge variant={d.tipo === 'FALTANTE' ? 'error' : 'warning'} size="sm">
            {d.tipo === 'FALTANTE' ? 'Faltante (não conferido no recebimento)' : 'Excedente (QR fora da remessa)'}
          </Badge>
          <span className="text-xs text-gray-400">{new Date(d.created_at).toLocaleString('pt-BR')}</span>
        </div>
        <p className="font-medium text-gray-900 truncate">{d.item?.produto?.nome ?? 'Produto'}</p>
        <p className="text-xs text-gray-500 font-mono mt-0.5">QR {tokenCurto(d)}</p>
        {!agruparRemessa && (
          <p className="text-xs text-gray-500 mt-1">
            {normTransf(d.transferencia)?.origem?.nome ?? '?'} → {normTransf(d.transferencia)?.destino?.nome ?? '?'}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {d.resolvido ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="w-4 h-4" /> {d.resolvedor?.nome ?? 'Resolvida'}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            {d.tipo === 'FALTANTE' ? (
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => setEntradaModal(d)}
                disabled={!!actionLoading || entradaLoadingId === d.id}
                className="whitespace-nowrap"
              >
                <Warehouse className="w-3.5 h-3.5 mr-1 shrink-0" />
                Dar entrada na loja
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => handleResolver(d.id)}
              disabled={actionLoading === d.id || entradaLoadingId === d.id}
            >
              {actionLoading === d.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Resolver
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  if (loading && divergencias.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-0">
      {entradaModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="entrada-faltante-titulo"
        >
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-md w-full p-4 space-y-3">
            <h2 id="entrada-faltante-titulo" className="text-lg font-semibold text-gray-900">
              Dar entrada na loja (faltante)
            </h2>
            <p className="text-sm text-gray-600">
              Confirma que a unidade foi localizada e deve ficar no estoque de{' '}
              <strong>{normTransf(entradaModal.transferencia)?.destino?.nome ?? 'destino'}</strong>. O
              sistema marcará a linha como recebida e atualizará o estoque agregado.
            </p>
            <p className="text-xs text-gray-500 font-mono truncate" title={entradaModal.item?.token_qr}>
              {entradaModal.item?.produto?.nome ?? 'Produto'} · QR {tokenCurto(entradaModal)}
            </p>
            {entradaErro ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {entradaErro}
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Login operacional</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                autoComplete="username"
                value={entradaLogin}
                onChange={(e) => setEntradaLogin(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Senha</label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                autoComplete="current-password"
                value={entradaSenha}
                onChange={(e) => setEntradaSenha(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEntradaModal(null)}
                disabled={!!entradaLoadingId}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleConfirmarEntradaLoja()}
                disabled={!!entradaLoadingId}
              >
                {entradaLoadingId ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Confirmar entrada
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Divergências</h1>
          <p className="text-sm text-gray-500">
            Faltante = esperado na remessa e não escaneado ao confirmar. Excedente = QR lido mas não pertencia à remessa.
            Para faltante localizado depois, use <strong>Dar entrada na loja</strong> (credencial do gestor); «Resolver»
            apenas encerra o registro sem mover estoque.
          </p>
        </div>
        <span className="ml-auto sm:ml-0">
          <Badge variant="warning">
            {divergencias.length} na lista · {abertasCount} aberta(s)
          </Badge>
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(['abertas', 'resolvidas', 'todas'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setSituacao(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                situacao === f ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'abertas' ? 'Abertas' : f === 'resolvidas' ? 'Resolvidas' : 'Todas'}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Loja (destino da remessa)</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
            >
              <option value="">Todas as lojas</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value as typeof tipoFiltro)}
            >
              <option value="todos">Faltante e excedente</option>
              <option value="FALTANTE">Só faltantes</option>
              <option value="EXCEDENTE">Só excedentes</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Remessa</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            value={remessaUuid}
            onChange={(e) => setRemessaUuid(e.target.value)}
          >
            <option value="">Todas as remessas (com divergência registrada)</option>
            {remessaOpcoes.map((o) => {
              const data = new Date(o.created_at).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const idCurto = o.id.slice(0, 8).toUpperCase();
              const rotulo = `${o.origem_nome} → ${o.destino_nome} · ${data} · ${idCurto}… · ${o.status}${
                o.viagem_resumo ? ` · Viagem ${o.viagem_resumo}` : ''
              }`;
              return (
                <option key={o.id} value={o.id}>
                  {rotulo}
                </option>
              );
            })}
          </select>
          {remessaUuid ? (
            <p className="text-xs text-gray-600 mt-1.5 break-all font-mono">
              <span className="text-gray-500 font-sans">UUID:</span> {remessaUuid}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              Só aparecem remessas que já geraram divergência. Filtre por loja acima para encurtar a lista.
            </p>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar produto, token, id remessa ou viagem…"
            className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={agruparRemessa}
            onChange={(e) => setAgruparRemessa(e.target.checked)}
            className="rounded border-gray-300"
          />
          Agrupar por remessa (recomendado)
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              void loadOpcoesRemessas();
              void carregar();
            }}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Atualizar
          </Button>
          <span className="text-xs text-gray-400">Até 800 registros mais recentes com os filtros atuais</span>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{loadError}</div>
      )}
      {resolverErro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex justify-between gap-2">
          <span>{resolverErro}</span>
          <button type="button" className="text-red-600 underline shrink-0" onClick={() => setResolverErro(null)}>
            Fechar
          </button>
        </div>
      )}

      <div className="space-y-3">
        {divergencias.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma divergência com estes filtros</p>
          </div>
        )}

        {agruparRemessa
          ? grupos.map((g) => {
              const meta = g.meta;
              const nFal = g.itens.filter((i) => i.tipo === 'FALTANTE').length;
              const nExc = g.itens.filter((i) => i.tipo === 'EXCEDENTE').length;
              const abertoGrupo = g.itens.some((i) => !i.resolvido);
              const exp = expandidas[g.transId] ?? true;
              const vid = meta?.viagem_id ? meta.viagem_id.slice(0, 8).toUpperCase() : null;

              return (
                <div key={g.transId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGrupo(g.transId)}
                    className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50/80 transition-colors"
                  >
                    {exp ? (
                      <ChevronDown className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Package className="w-4 h-4 text-gray-500 shrink-0" />
                        <span className="font-semibold text-gray-900">Remessa</span>
                        {abertoGrupo ? (
                          <Badge variant="warning" size="sm">
                            Pendências
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">
                            Só resolvidas
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-700">
                        <span className="text-gray-500">Origem → destino:</span>{' '}
                        {meta?.origem?.nome ?? '?'} → {meta?.destino?.nome ?? '?'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 font-mono">
                        Transferência · {g.transId}
                        {vid ? ` · Viagem · ${vid}` : null}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {nFal > 0 && (
                          <span className="text-red-700 font-medium">{nFal} faltante(s)</span>
                        )}
                        {nFal > 0 && nExc > 0 && <span className="mx-1">·</span>}
                        {nExc > 0 && (
                          <span className="text-amber-800 font-medium">{nExc} excedente(s)</span>
                        )}
                        <span className="text-gray-400 ml-2">
                          · Status remessa: {meta?.status ?? '—'} · {meta?.tipo ?? '—'}
                        </span>
                      </p>
                    </div>
                  </button>
                  {exp && <div className="px-4 pb-4 pt-0 space-y-2 border-t border-gray-100">{g.itens.map(renderLinha)}</div>}
                </div>
              );
            })
          : divergencias.map(renderLinha)}
      </div>
    </div>
  );
}
