'use client';

import { Timer, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { getUsuarioLogado } from '@/lib/auth';
import {
  formatarDataHoraBr,
  formatarInstanteConsultaBr,
  formatarSoDataBr,
} from '@/lib/datas/formatar-auditoria-br';
import { escopoValidadesPorPerfil } from '@/lib/operador-loja-scope';
import {
  listarItensAlertaValidade,
  type ItemValidadeRow,
} from '@/lib/services/validades-itens';

function joinUm<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function tokenExibicao(i: ItemValidadeRow): string {
  const s = i.token_short?.trim();
  if (s) return s;
  const q = i.token_qr;
  if (q && q.length > 14) return `…${q.slice(-10)}`;
  return q || '—';
}

function ordenarPorLocalDepoisValidade(rows: ItemValidadeRow[]): ItemValidadeRow[] {
  return [...rows].sort((a, b) => {
    const na = (a.local_atual?.nome || '').localeCompare(b.local_atual?.nome || '', 'pt-BR');
    if (na !== 0) return na;
    return new Date(a.data_validade).getTime() - new Date(b.data_validade).getTime();
  });
}

export default function ValidadesPage() {
  const { usuario } = useAuth();
  const usuarioEscopo =
    usuario ?? (typeof window !== 'undefined' ? getUsuarioLogado() : null);

  const escopo = useMemo(() => escopoValidadesPorPerfil(usuarioEscopo), [usuarioEscopo]);

  const [dias, setDias] = useState(7);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [proximos, setProximos] = useState<ItemValidadeRow[]>([]);
  const [vencidos, setVencidos] = useState<ItemValidadeRow[]>([]);
  const [instanteConsulta, setInstanteConsulta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (escopo.tipo !== 'local' && escopo.tipo !== 'todos_locais') return;

    setLoading(true);
    setErro(null);
    const localId = escopo.tipo === 'local' ? escopo.localId : undefined;
    const { proximos: p, vencidos: v, error } = await listarItensAlertaValidade({
      localAtualId: localId,
      diasProximos: dias,
    });
    setInstanteConsulta(formatarInstanteConsultaBr(new Date()));
    if (error) {
      setErro(error);
      setProximos([]);
      setVencidos([]);
    } else {
      const variosLocais = escopo.tipo === 'todos_locais';
      setProximos(variosLocais ? ordenarPorLocalDepoisValidade(p) : p);
      setVencidos(variosLocais ? ordenarPorLocalDepoisValidade(v) : v);
    }
    setLoading(false);
  }, [escopo, dias]);

  useEffect(() => {
    if (escopo.tipo !== 'local' && escopo.tipo !== 'todos_locais') return;
    const id = requestAnimationFrame(() => {
      void carregar();
    });
    return () => cancelAnimationFrame(id);
  }, [carregar, escopo.tipo]);

  useEffect(() => {
    if (escopo.tipo !== 'local' && escopo.tipo !== 'todos_locais') return;
    const id = setInterval(() => void carregar(), 90_000);
    return () => clearInterval(id);
  }, [carregar, escopo]);

  const subtituloEscopo =
    escopo.tipo === 'local' && escopo.contexto === 'loja'
      ? 'Somente itens em estoque na sua loja (não inclui unidades na indústria ou em trânsito).'
      : escopo.tipo === 'local' && escopo.contexto === 'industria'
        ? 'Somente itens em estoque no seu local da indústria (matriz).'
        : escopo.tipo === 'todos_locais'
          ? 'Visão consolidada: todas as unidades com validade a vencer ou vencida.'
          : null;

  if (!usuarioEscopo) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (escopo.tipo === 'indisponivel' && escopo.mensagem) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Validades</h1>
            <p className="text-sm text-amber-800 mt-1">{escopo.mensagem}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading && proximos.length === 0 && vencidos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  const agora = new Date();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <Timer className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Validades</h1>
            <p className="text-sm text-gray-500">Itens próximos do vencimento</p>
            {subtituloEscopo && (
              <p className="text-xs text-gray-500 mt-1 max-w-xl">{subtituloEscopo}</p>
            )}
            {instanteConsulta && (
              <p className="text-xs text-gray-600 mt-2 max-w-2xl leading-relaxed">
                <span className="font-medium text-gray-700">Referência desta lista (auditoria):</span>{' '}
                {instanteConsulta}. Compare com a validade do produto e com a data em que a unidade foi
                confirmada neste local (recebimento ou ajuste).
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Não foi possível carregar as validades: {erro}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {[3, 7, 14, 30].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDias(d)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              dias === d ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {d} dias
          </button>
        ))}
      </div>

      {vencidos.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-red-600 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Vencidos ({vencidos.length})
          </h2>
          <div className="space-y-2 mb-6">
            {vencidos.slice(0, 50).map((i) => {
              const lc = joinUm(i.lote_compra);
              const diasAtraso = Math.max(
                0,
                Math.floor(
                  (agora.getTime() - new Date(i.data_validade).getTime()) / 86_400_000
                )
              );
              return (
                <div
                  key={i.id}
                  className="bg-red-50 border border-red-200 rounded-xl p-3 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-start"
                >
                  <div className="min-w-0 space-y-1.5">
                    <p className="font-semibold text-red-800">{i.produto?.nome ?? '—'}</p>
                    <p className="text-xs text-red-600/90">
                      <span className="text-red-400">{i.local_atual?.nome ?? 'Local —'}</span>
                      {' · '}
                      <span className="font-mono" title={i.token_qr}>
                        {tokenExibicao(i)}
                      </span>
                    </p>
                    <p className="text-[11px] text-red-700/80 font-mono break-all">ID {i.id}</p>
                    <div className="pt-1 space-y-0.5 text-xs text-red-900/85">
                      <p>
                        <span className="text-red-600">Unidade no sistema desde:</span>{' '}
                        {formatarDataHoraBr(i.created_at)}
                      </p>
                      {i.data_producao ? (
                        <p>
                          <span className="text-red-600">Data produção (item):</span>{' '}
                          {formatarSoDataBr(i.data_producao)}
                        </p>
                      ) : null}
                      {i.confirmacao_neste_local_em ? (
                        <p>
                          <span className="text-red-600">Confirmação neste local:</span>{' '}
                          {formatarDataHoraBr(i.confirmacao_neste_local_em)} (recebimento ou entrada
                          avulsa)
                        </p>
                      ) : i.remessa_vinculada_criada_em ? (
                        <p>
                          <span className="text-red-600">Remessa vinculada (registro):</span>{' '}
                          {formatarDataHoraBr(i.remessa_vinculada_criada_em)}{' '}
                          <span className="text-red-700/80">
                            — sem auditoria de recebimento; data da criação da remessa.
                          </span>
                        </p>
                      ) : (
                        <p>
                          <span className="text-red-600">Confirmação neste local:</span> sem registro
                          (ex.: origem local ou histórico antigo).
                        </p>
                      )}
                      {i.etiqueta?.lote ? (
                        <p>
                          <span className="text-red-600">Lote / remessa (etiqueta):</span>{' '}
                          <span className="font-mono">{i.etiqueta.lote}</span>
                        </p>
                      ) : null}
                      {lc ? (
                        <p>
                          <span className="text-red-600">Lote compra:</span>{' '}
                          {lc.lote_fornecedor ?? '—'}
                          {lc.nota_fiscal ? ` · NF ${lc.nota_fiscal}` : null}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <Badge variant="error" size="sm">
                      Vencido
                      {diasAtraso > 0 ? ` · há ${diasAtraso}d` : ''}
                    </Badge>
                    <p className="text-xs text-red-700 mt-1 font-medium">
                      Validade: {formatarSoDataBr(i.data_validade)}
                    </p>
                  </div>
                </div>
              );
            })}
            {vencidos.length > 50 && (
              <p className="text-xs text-gray-500">
                Mostrando 50 de {vencidos.length} vencidos. Use filtros ou relatórios para lista completa.
              </p>
            )}
          </div>
        </>
      )}

      <h2 className="text-lg font-semibold text-gray-700 mb-3">
        Próximos {dias} dias ({proximos.length})
      </h2>
      <div className="space-y-2">
        {proximos.map((i) => {
          const diasRestantes = Math.ceil(
            (new Date(i.data_validade).getTime() - agora.getTime()) / 86400000
          );
          const lc = joinUm(i.lote_compra);
          return (
            <div
              key={i.id}
              className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-start"
            >
              <div className="min-w-0 space-y-1.5">
                <p className="font-semibold text-gray-900">{i.produto?.nome ?? '—'}</p>
                <p className="text-xs text-gray-500">
                  {i.local_atual?.nome ?? 'Local —'} ·{' '}
                  <span className="font-mono" title={i.token_qr}>
                    {tokenExibicao(i)}
                  </span>
                </p>
                <p className="text-[11px] text-gray-400 font-mono break-all">ID {i.id}</p>
                <div className="pt-1 space-y-0.5 text-xs text-gray-700">
                  <p>
                    <span className="text-gray-500">Unidade no sistema desde:</span>{' '}
                    {formatarDataHoraBr(i.created_at)}
                  </p>
                  {i.data_producao ? (
                    <p>
                      <span className="text-gray-500">Data produção (item):</span>{' '}
                      {formatarSoDataBr(i.data_producao)}
                    </p>
                  ) : null}
                  {i.confirmacao_neste_local_em ? (
                    <p>
                      <span className="text-gray-500">Confirmação neste local:</span>{' '}
                      {formatarDataHoraBr(i.confirmacao_neste_local_em)}
                    </p>
                  ) : i.remessa_vinculada_criada_em ? (
                    <p>
                      <span className="text-gray-500">Remessa vinculada (registro):</span>{' '}
                      {formatarDataHoraBr(i.remessa_vinculada_criada_em)}
                      <span className="text-gray-400"> · sem auditoria de recebimento</span>
                    </p>
                  ) : (
                    <p>
                      <span className="text-gray-500">Confirmação neste local:</span>{' '}
                      <span className="text-gray-400">sem registro</span>
                    </p>
                  )}
                  {i.etiqueta?.lote ? (
                    <p>
                      <span className="text-gray-500">Lote / remessa (etiqueta):</span>{' '}
                      <span className="font-mono">{i.etiqueta.lote}</span>
                    </p>
                  ) : null}
                  {lc ? (
                    <p>
                      <span className="text-gray-500">Lote compra:</span>{' '}
                      {lc.lote_fornecedor ?? '—'}
                      {lc.nota_fiscal ? ` · NF ${lc.nota_fiscal}` : null}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <Badge
                  variant={
                    diasRestantes <= 2 ? 'error' : diasRestantes <= 5 ? 'warning' : 'info'
                  }
                  size="sm"
                >
                  {diasRestantes}d
                </Badge>
                <p className="text-xs text-gray-600 mt-1 font-medium">
                  Validade: {formatarSoDataBr(i.data_validade)}
                </p>
              </div>
            </div>
          );
        })}
        {proximos.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400">
            <Timer className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum item próximo do vencimento neste período</p>
          </div>
        )}
      </div>
    </div>
  );
}
