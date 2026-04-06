'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { QrCode, Loader2, Printer, Server, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { usePiPrintBridgeConfig } from '@/hooks/usePiPrintBridgeConfig';
import { supabase } from '@/lib/supabase';
import {
  confirmarImpressao,
  FORMATO_CONFIG,
  FORMATO_ETIQUETA_FLUXO_OPERACIONAL,
  FORMATO_IMPRESSAO_STORAGE_KEY,
  FormatoEtiqueta,
  gerarDocumentoHtmlEtiquetas,
  imprimirEtiquetasEmJobUnico,
  type EtiquetaParaImpressao,
} from '@/lib/printing/label-print';
import { enviarHtmlParaPiPrintBridge } from '@/lib/printing/pi-print-ws-client';
import { lerUltimaRemessaPersistida } from '@/lib/separacao/ultima-remessa-storage';
import {
  type MetaTransferenciaRemessa,
  dataReferenciaRemessa,
  formatarDataHoraRemessaPt,
  parseViagemIdDeLoteSep,
  resumoProdutosRemessa,
  rotuloOpcaoSelectRemessa,
  statusTransferenciaLegivel,
} from '@/lib/separacao/remessa-separacao-ui';

interface EtiquetaRow {
  id: string;
  produto_id: string;
  data_producao: string;
  data_validade: string;
  lote: string | null;
  impressa: boolean;
  excluida: boolean;
  created_at: string;
  produto: { nome: string; validade_dias?: number; validade_horas?: number; validade_minutos?: number };
  item?: { id: string; token_qr: string; token_short: string | null } | null;
}

interface GrupoEtiquetas {
  chave: string;
  lote: string;
  produtoNome: string;
  total: number;
  pendentes: number;
  impressas: number;
  etiquetas: EtiquetaRow[];
}

function produtoTemValidade(produto: EtiquetaRow['produto'] | undefined) {
  return Boolean(
    ((produto?.validade_dias || 0) > 0) ||
      ((produto?.validade_horas || 0) > 0) ||
      ((produto?.validade_minutos || 0) > 0)
  );
}

/** Limite de linhas na UI: evita carregar milhões de etiquetas e travar o navegador. */
const MAX_ETIQUETAS_NA_TELA = 5000;
const CHUNK_ITENS = 400;

function rowsParaEtiquetasImpressao(lista: EtiquetaRow[], usuarioNome: string): EtiquetaParaImpressao[] {
  return lista.map((e) => ({
    id: e.id,
    produtoNome: e.produto?.nome || 'Produto',
    dataManipulacao: e.data_producao,
    dataValidade: produtoTemValidade(e.produto) ? e.data_validade : '',
    lote: e.lote || '-',
    tokenQr: e.item?.token_qr || e.id,
    tokenShort: e.item?.token_short || e.id.slice(0, 8).toUpperCase(),
    responsavel: usuarioNome,
    dataGeracaoIso: e.created_at,
  }));
}

export default function EtiquetasPage() {
  const { usuario } = useAuth();
  const {
    loading: piCfgLoading,
    available: piPrintAvailable,
    connection: piConnection,
  } = usePiPrintBridgeConfig({ papel: 'estoque' });

  const enrichEtiquetasComItens = useCallback(async (rows: Record<string, unknown>[]): Promise<EtiquetaRow[]> => {
    const ids = rows.map((row) => row.id).filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return rows as unknown as EtiquetaRow[];

    const itemMap = new Map<string, { id: string; token_qr: string; token_short: string | null }>();
    for (let i = 0; i < ids.length; i += CHUNK_ITENS) {
      const slice = ids.slice(i, i + CHUNK_ITENS);
      const { data: itens, error } = await supabase
        .from('itens')
        .select('id, token_qr, token_short')
        .in('id', slice);
      if (error) throw error;
      (itens || []).forEach((item) => itemMap.set(item.id, item));
    }

    return rows.map((row) => ({
      ...row,
      item: itemMap.get(String(row.id)) || null,
    })) as unknown as EtiquetaRow[];
  }, []);

  const { data: etiquetas, loading } = useRealtimeQuery<EtiquetaRow>({
    table: 'etiquetas',
    select: '*, produto:produtos(nome, validade_dias, validade_horas, validade_minutos)',
    orderBy: { column: 'created_at', ascending: false },
    transform: enrichEtiquetasComItens,
    maxRows: MAX_ETIQUETAS_NA_TELA,
    refetchDebounceMs: 500,
  });

  const [filtro, setFiltro] = useState<'todas' | 'pendentes' | 'impressas'>('pendentes');
  const [formatoImpressao, setFormatoImpressao] = useState<FormatoEtiqueta>('60x30');
  const [printing, setPrinting] = useState(false);
  const [erroImpressao, setErroImpressao] = useState('');
  const [avisoHttpsPi, setAvisoHttpsPi] = useState(false);
  const [loteRemessaBulk, setLoteRemessaBulk] = useState<string | null>(null);
  const [metaTransferenciaPorViagem, setMetaTransferenciaPorViagem] = useState<
    Map<string, MetaTransferenciaRemessa>
  >(() => new Map());
  const [carregandoMetaRemessa, setCarregandoMetaRemessa] = useState(false);

  useEffect(() => {
    const salvo = window.localStorage.getItem(FORMATO_IMPRESSAO_STORAGE_KEY);
    if (salvo === '60x30' || salvo === '60x60' || salvo === '58x40' || salvo === '50x30') {
      setFormatoImpressao(salvo);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FORMATO_IMPRESSAO_STORAGE_KEY, formatoImpressao);
  }, [formatoImpressao]);

  useEffect(() => {
    if (!piConnection?.wsUrl) {
      setAvisoHttpsPi(false);
      return;
    }
    const u = piConnection.wsUrl.toLowerCase();
    setAvisoHttpsPi(typeof window !== 'undefined' && window.location.protocol === 'https:' && u.startsWith('ws:'));
  }, [piConnection]);

  /** Remessas vindas de Separar por Loja (lote SEP-…), mais recentes primeiro. */
  const remessasSeparacaoLoja = useMemo(() => {
    const map = new Map<string, EtiquetaRow[]>();
    for (const e of etiquetas) {
      if (e.excluida) continue;
      const l = e.lote;
      if (!l || !l.startsWith('SEP-')) continue;
      const arr = map.get(l) || [];
      arr.push(e);
      map.set(l, arr);
    }
    return Array.from(map.entries())
      .map(([lote, rows]) => ({
        lote,
        rows,
        maisRecente: Math.max(...rows.map((r) => new Date(r.created_at).getTime())),
      }))
      .sort((a, b) => b.maisRecente - a.maisRecente);
  }, [etiquetas]);

  const viagensIdsParaMeta = useMemo(() => {
    const ids = new Set<string>();
    for (const e of etiquetas) {
      if (e.excluida) continue;
      const id = parseViagemIdDeLoteSep(e.lote);
      if (id) ids.add(id);
    }
    return [...ids].sort();
  }, [etiquetas]);

  const viagensMetaChave = useMemo(() => viagensIdsParaMeta.join('|'), [viagensIdsParaMeta]);

  useEffect(() => {
    if (viagensIdsParaMeta.length === 0) {
      setMetaTransferenciaPorViagem(new Map());
      setCarregandoMetaRemessa(false);
      return;
    }
    let cancelled = false;
    setCarregandoMetaRemessa(true);
    void (async () => {
      const { data, error } = await supabase
        .from('transferencias')
        .select(
          'viagem_id, created_at, status, origem:locais!origem_id(nome), destino:locais!destino_id(nome)'
        )
        .in('viagem_id', viagensIdsParaMeta);
      if (cancelled) return;
      setCarregandoMetaRemessa(false);
      if (error || !data) {
        setMetaTransferenciaPorViagem(new Map());
        return;
      }
      const m = new Map<string, MetaTransferenciaRemessa>();
      for (const row of data) {
        if (!row.viagem_id) continue;
        const o = row.origem as { nome?: string } | null;
        const d = row.destino as { nome?: string } | null;
        m.set(row.viagem_id, {
          origemNome: o?.nome?.trim() || 'Origem não informada',
          destinoNome: d?.nome?.trim() || 'Destino não informado',
          createdAt: row.created_at,
          status: row.status,
        });
      }
      setMetaTransferenciaPorViagem(m);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viagensMetaChave já reflete o conjunto em viagensIdsParaMeta
  }, [viagensMetaChave]);

  const remessaBulkContexto = useMemo(() => {
    if (!loteRemessaBulk) return null;
    const entry = remessasSeparacaoLoja.find((r) => r.lote === loteRemessaBulk);
    if (!entry) return null;
    const vid = parseViagemIdDeLoteSep(loteRemessaBulk);
    const meta = vid ? metaTransferenciaPorViagem.get(vid) : undefined;
    return { entry, meta, vid };
  }, [loteRemessaBulk, remessasSeparacaoLoja, metaTransferenciaPorViagem]);

  useEffect(() => {
    if (remessasSeparacaoLoja.length === 0) {
      setLoteRemessaBulk(null);
      return;
    }
    setLoteRemessaBulk((prev) => {
      if (prev && remessasSeparacaoLoja.some((r) => r.lote === prev)) return prev;
      const salva = lerUltimaRemessaPersistida();
      if (salva && remessasSeparacaoLoja.some((r) => r.lote === salva.lote)) return salva.lote;
      return remessasSeparacaoLoja[0].lote;
    });
  }, [remessasSeparacaoLoja]);

  const linhasRemessaBulk = useMemo(() => {
    if (!loteRemessaBulk) return [];
    const found = remessasSeparacaoLoja.find((r) => r.lote === loteRemessaBulk);
    return found?.rows ?? [];
  }, [loteRemessaBulk, remessasSeparacaoLoja]);

  const pendentesRemessaBulk = useMemo(
    () => linhasRemessaBulk.filter((e) => !e.impressa).length,
    [linhasRemessaBulk]
  );

  const filtradas = useMemo(
    () =>
      etiquetas.filter((e) => {
        if (e.excluida) return false;
        if (filtro === 'pendentes') return !e.impressa;
        if (filtro === 'impressas') return e.impressa;
        return true;
      }),
    [etiquetas, filtro]
  );

  const grupos = useMemo(() => {
    const map = new Map<string, GrupoEtiquetas>();
    for (const etiqueta of filtradas) {
      const lote = etiqueta.lote || `SEM_LOTE_${etiqueta.id}`;
      const produtoNome = etiqueta.produto?.nome || 'Produto';
      const chave = `${lote}::${produtoNome}`;
      let g = map.get(chave);
      if (!g) {
        g = {
          chave,
          lote: etiqueta.lote || 'Sem lote',
          produtoNome,
          total: 0,
          pendentes: 0,
          impressas: 0,
          etiquetas: [],
        };
        map.set(chave, g);
      }
      g.etiquetas.push(etiqueta);
      g.total += 1;
      if (etiqueta.impressa) g.impressas += 1;
      else g.pendentes += 1;
    }
    return Array.from(map.values());
  }, [filtradas]);

  const marcarImpressa = async (ids: string[]) => {
    const { error } = await supabase.from('etiquetas').update({ impressa: true }).in('id', ids);
    if (error) throw error;
  };

  const excluir = async (id: string) => {
    await supabase.from('etiquetas').update({ excluida: true }).eq('id', id);
  };

  const imprimirLista = async (lista: EtiquetaRow[]) => {
    if (lista.length === 0) return;
    if (!confirmarImpressao(lista.length, formatoImpressao)) return;

    setPrinting(true);
    setErroImpressao('');

    try {
      const sucesso = await imprimirEtiquetasEmJobUnico(
        rowsParaEtiquetasImpressao(lista, usuario?.nome || 'OPERADOR'),
        formatoImpressao
      );

      if (!sucesso) {
        throw new Error('Não foi possível abrir a janela de impressão. Libere pop-ups e tente novamente.');
      }

      await marcarImpressa(lista.map((e) => e.id));
    } catch (err: unknown) {
      setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir etiquetas');
    } finally {
      setPrinting(false);
    }
  };

  /** Fluxo operacional Zebra: sempre 60×30 (igual Separar por Loja / Produção). */
  const imprimirListaNoPi = async (lista: EtiquetaRow[]) => {
    if (lista.length === 0) return;
    if (!piPrintAvailable || !piConnection) {
      alert(
        'Impressão na estação indisponível. Configure em Configurações → Impressoras (Pi) ou NEXT_PUBLIC_PI_PRINT_WS_URL. Veja docs/IMPRESSAO_PI_ACESSO_REMOTO.md.'
      );
      return;
    }
    if (!confirmarImpressao(lista.length, FORMATO_ETIQUETA_FLUXO_OPERACIONAL)) return;

    setPrinting(true);
    setErroImpressao('');
    const jobName = `etiquetas-${lista[0]?.lote || lista[0]?.id || 'lote'}`.slice(0, 120);

    try {
      const etiquetas = rowsParaEtiquetasImpressao(lista, usuario?.nome || 'OPERADOR');
      const html = await gerarDocumentoHtmlEtiquetas(etiquetas, FORMATO_ETIQUETA_FLUXO_OPERACIONAL);
      await enviarHtmlParaPiPrintBridge(html, { jobName, connection: piConnection, papel: 'estoque' });
      await marcarImpressa(lista.map((e) => e.id));
    } catch (err: unknown) {
      setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir na estação Pi');
    } finally {
      setPrinting(false);
    }
  };

  const imprimirEtiqueta = async (e: EtiquetaRow) => {
    await imprimirLista([e]);
  };

  const imprimirPendentes = async () => {
    const pendentes = filtradas.filter((e) => !e.impressa);
    await imprimirLista(pendentes);
  };

  const imprimirGrupo = async (grupo: GrupoEtiquetas) => {
    const pendentes = grupo.etiquetas.filter((etiqueta) => !etiqueta.impressa);
    await imprimirLista(pendentes);
  };

  const imprimirGrupoNoPi = async (grupo: GrupoEtiquetas) => {
    const pendentes = grupo.etiquetas.filter((etiqueta) => !etiqueta.impressa);
    await imprimirListaNoPi(pendentes);
  };

  const imprimirPendentesNoPi = async () => {
    const pendentes = filtradas.filter((e) => !e.impressa);
    await imprimirListaNoPi(pendentes);
  };

  /** Remessa SEP-…: mesmo formato 60×30 da separação (independente do seletor da página). */
  const imprimirRemessaInteiraNavegador = async (lista: EtiquetaRow[]) => {
    if (lista.length === 0) return;
    if (!confirmarImpressao(lista.length, FORMATO_ETIQUETA_FLUXO_OPERACIONAL)) return;

    setPrinting(true);
    setErroImpressao('');
    try {
      const ok = await imprimirEtiquetasEmJobUnico(
        rowsParaEtiquetasImpressao(lista, usuario?.nome || 'OPERADOR'),
        FORMATO_ETIQUETA_FLUXO_OPERACIONAL
      );
      if (!ok) {
        throw new Error('Não foi possível abrir a janela de impressão. Libere pop-ups e tente novamente.');
      }
      await marcarImpressa(lista.map((e) => e.id));
    } catch (err: unknown) {
      setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir remessa no navegador');
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Etiquetas</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <select
            value={formatoImpressao}
            onChange={(event) => setFormatoImpressao(event.target.value as FormatoEtiqueta)}
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            aria-label="Formato de impressão"
          >
            {(Object.keys(FORMATO_CONFIG) as FormatoEtiqueta[]).map((formato) => (
              <option key={formato} value={formato}>
                {FORMATO_CONFIG[formato].label}
              </option>
            ))}
          </select>
          {filtradas.filter((e) => !e.impressa).length > 0 && (
            <>
              <Button variant="primary" onClick={() => void imprimirPendentes()} disabled={printing} className="w-full sm:w-auto">
                {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                Imprimir pendentes (navegador)
              </Button>
              <Button
                variant="outline"
                onClick={() => void imprimirPendentesNoPi()}
                disabled={printing || piCfgLoading || !piPrintAvailable}
                title={
                  !piPrintAvailable && !piCfgLoading
                    ? 'Configure a ponte Pi em Configurações → Impressoras'
                    : 'Envia 60×30 para Raspberry / Zebra'
                }
                className="w-full sm:w-auto border-emerald-300 text-emerald-900 hover:bg-emerald-50"
              >
                {printing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Server className="w-4 h-4 mr-2" />
                )}
                Zebra / Pi
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-gray-500">
        Formato selecionado fica salvo como padrão neste dispositivo (impressão pelo{' '}
        <strong>navegador</strong>). Na <strong>Zebra via Pi</strong> usamos sempre <strong>60×30 mm</strong> (fluxo
        operacional), como em Separar por Loja.{' '}
        <Link href="/teste-impressao-etiqueta" className="text-red-600 font-medium underline underline-offset-2">
          Teste de impressão
        </Link>{' '}
        (amostra fictícia).
      </p>
      {avisoHttpsPi && (
        <p className="mb-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Esta página está em <strong>HTTPS</strong> e a URL do Pi usa <strong>ws://</strong> — o navegador pode bloquear
          a ponte. Use <strong>wss://</strong> no túnel ou teste em <code className="text-[11px]">http://localhost</code>{' '}
          na mesma rede.
        </p>
      )}
      <p className="mb-4 text-xs text-amber-800/90 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
        Mostrando as <strong>{MAX_ETIQUETAS_NA_TELA.toLocaleString('pt-BR')} etiquetas mais recentes</strong> (por data de
        criação). Listas muito grandes deixavam a página lenta; etiquetas antigas não aparecem aqui — use relatórios ou o
        banco se precisar do histórico completo.
      </p>

      {erroImpressao && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erroImpressao}
        </div>
      )}

      {remessasSeparacaoLoja.length > 0 && loteRemessaBulk && linhasRemessaBulk.length > 0 && remessaBulkContexto && (
        <div className="mb-5 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4 shadow-sm space-y-3">
          <div className="flex flex-col gap-2">
            <p className="text-lg font-bold text-emerald-950">Remessa (Separar por Loja) — imprimir tudo na Zebra</p>
            {carregandoMetaRemessa && (
              <p className="text-xs text-emerald-800">Carregando origem, destino e data da remessa…</p>
            )}
            <div className="text-sm text-emerald-950 space-y-1.5 rounded-lg bg-white/70 border border-emerald-100 px-3 py-2.5">
              <p className="font-semibold">
                {formatarDataHoraRemessaPt(
                  dataReferenciaRemessa(remessaBulkContexto.entry.rows, remessaBulkContexto.meta)
                )}
                {remessaBulkContexto.meta ? (
                  <>
                    {' '}
                    · <span className="text-emerald-900">{remessaBulkContexto.meta.origemNome}</span>
                    <span className="text-emerald-700 font-normal"> → </span>
                    <span className="text-emerald-900">{remessaBulkContexto.meta.destinoNome}</span>
                  </>
                ) : (
                  <span className="text-amber-800 font-normal text-xs block mt-1">
                    Origem e destino ainda não carregaram (ou transferência não encontrada). A data acima vem das
                    etiquetas.
                  </span>
                )}
              </p>
              {remessaBulkContexto.meta && (
                <p className="text-xs text-emerald-800">
                  Situação da viagem: <strong>{statusTransferenciaLegivel(remessaBulkContexto.meta.status)}</strong>
                </p>
              )}
              <p className="text-xs text-emerald-900">
                <strong>{linhasRemessaBulk.length}</strong> etiqueta(s) nesta remessa —{' '}
                <strong>{pendentesRemessaBulk}</strong> ainda sem impressão,{' '}
                <strong>{linhasRemessaBulk.length - pendentesRemessaBulk}</strong> já impressas.
              </p>
              {resumoProdutosRemessa(linhasRemessaBulk, 4) && (
                <p className="text-xs text-gray-700">
                  <span className="font-medium text-emerald-900">Produtos:</span> {resumoProdutosRemessa(linhasRemessaBulk, 4)}
                </p>
              )}
              <p className="text-[11px] text-gray-500 font-mono break-all">
                Código interno (suporte): {loteRemessaBulk}
              </p>
              {typeof window !== 'undefined' &&
                (() => {
                  const salva = lerUltimaRemessaPersistida();
                  if (salva?.lote !== loteRemessaBulk) return null;
                  return (
                    <p className="text-xs text-emerald-800">
                      Última separação registrada neste aparelho para a loja: <strong>{salva.nomeLoja}</strong>
                    </p>
                  );
                })()}
            </div>
            <p className="text-xs text-emerald-900">
              Abaixo a lista está <strong>por produto</strong>; os botões aqui enviam a <strong>sequência inteira</strong>{' '}
              da remessa (60×30).
            </p>
            {remessasSeparacaoLoja.length > 1 && (
              <label className="text-xs font-medium text-emerald-900">
                Trocar remessa (mesma tela — até {MAX_ETIQUETAS_NA_TELA.toLocaleString('pt-BR')} etiquetas mais recentes)
                <select
                  value={loteRemessaBulk}
                  onChange={(ev) => setLoteRemessaBulk(ev.target.value)}
                  className="mt-1 block w-full max-w-xl px-3 py-2 border border-emerald-300 rounded-lg text-sm bg-white"
                  title="Cada linha: data e hora · de onde saiu → para qual loja · quantidade"
                >
                  {remessasSeparacaoLoja.map((r) => {
                    const vid = parseViagemIdDeLoteSep(r.lote);
                    const meta = vid ? metaTransferenciaPorViagem.get(vid) : undefined;
                    return (
                      <option key={r.lote} value={r.lote}>
                        {rotuloOpcaoSelectRemessa(r.rows, meta)}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="primary"
              className="border-emerald-600 bg-emerald-700 hover:bg-emerald-800"
              disabled={printing || piCfgLoading || !piPrintAvailable}
              onClick={() => void imprimirListaNoPi(linhasRemessaBulk)}
              title="Um job na Pi com todas as etiquetas 60×30 desta remessa"
            >
              {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
              Zebra / Pi — remessa inteira ({linhasRemessaBulk.length})
            </Button>
            <Button
              variant="outline"
              className="border-emerald-300 text-emerald-900 hover:bg-emerald-100 bg-white"
              disabled={printing}
              onClick={() => void imprimirRemessaInteiraNavegador(linhasRemessaBulk)}
            >
              {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
              Navegador — remessa inteira (60×30)
            </Button>
          </div>
          {!piCfgLoading && !piPrintAvailable && (
            <p className="text-xs text-amber-900">
              Pi indisponível: use o botão do navegador ou Configurações → Impressoras.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {(['pendentes', 'impressas', 'todas'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filtro === f ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'pendentes' ? 'Pendentes' : f === 'impressas' ? 'Impressas' : 'Todas'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {grupos.map((grupo) => (
          <div key={grupo.chave} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{grupo.produtoNome}</p>
                <div className="flex flex-col gap-1 mt-1">
                  {(() => {
                    const vidGrupo = parseViagemIdDeLoteSep(grupo.lote);
                    if (!vidGrupo) return null;
                    const tm = metaTransferenciaPorViagem.get(vidGrupo);
                    if (tm) {
                      return (
                        <span className="text-xs text-gray-700">
                          <span className="font-medium text-gray-800">Remessa separação:</span>{' '}
                          {formatarDataHoraRemessaPt(tm.createdAt)} · {tm.origemNome} → {tm.destinoNome}
                          <span className="text-gray-500"> · {statusTransferenciaLegivel(tm.status)}</span>
                        </span>
                      );
                    }
                    if (carregandoMetaRemessa) {
                      return <span className="text-xs text-gray-500">Carregando dados da remessa…</span>;
                    }
                    return (
                      <span className="text-xs text-amber-800">
                        Remessa sem dados de transferência neste aparelho (código {grupo.lote}).
                      </span>
                    );
                  })()}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {parseViagemIdDeLoteSep(grupo.lote) ? (
                        <>
                          Código interno:{' '}
                          <code className="text-[10px] bg-gray-100 px-1 rounded">{grupo.lote}</code>
                        </>
                      ) : (
                        <>Lote: {grupo.lote}</>
                      )}
                    </span>
                  <span className="text-xs text-gray-500">Total: {grupo.total}</span>
                  <Badge variant="warning" size="sm">
                    Pendentes: {grupo.pendentes}
                  </Badge>
                  <Badge variant="success" size="sm">
                    Impressas: {grupo.impressas}
                  </Badge>
                  </div>
                </div>
              </div>
              {grupo.pendentes > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                  <Button variant="primary" onClick={() => void imprimirGrupo(grupo)} disabled={printing}>
                    {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                    Navegador ({grupo.pendentes})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void imprimirGrupoNoPi(grupo)}
                    disabled={printing || piCfgLoading || !piPrintAvailable}
                    className="border-emerald-300 text-emerald-900 hover:bg-emerald-50"
                  >
                    {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
                    Zebra / Pi ({grupo.pendentes})
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-3 max-h-48 overflow-y-auto space-y-2">
              {grupo.etiquetas.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400">
                      Val:{' '}
                      {produtoTemValidade(e.produto)
                        ? new Date(e.data_validade).toLocaleDateString('pt-BR')
                        : 'Sem validade'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      Token: {e.item?.token_short || e.id.slice(0, 8).toUpperCase()}
                    </span>
                    <Badge variant={e.impressa ? 'success' : 'warning'} size="sm">
                      {e.impressa ? 'Impressa' : 'Pendente'}
                    </Badge>
                  </div>
                  <div className="flex gap-1 self-end sm:self-auto">
                    <button
                      type="button"
                      aria-label="Imprimir etiqueta no navegador"
                      onClick={async () => {
                        setErroImpressao('');
                        try {
                          await imprimirEtiqueta(e);
                        } catch (err: unknown) {
                          setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir etiqueta');
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Imprimir etiqueta na Zebra via Pi"
                      disabled={printing || piCfgLoading || !piPrintAvailable}
                      title={
                        !piPrintAvailable
                          ? 'Configure a ponte Pi'
                          : 'Enviar esta etiqueta 60×30 para Raspberry / Zebra (reimpressão permitida)'
                      }
                      onClick={async () => {
                        setErroImpressao('');
                        try {
                          await imprimirListaNoPi([e]);
                        } catch (err: unknown) {
                          setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir na Pi');
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Server className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => excluir(e.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtradas.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <QrCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma etiqueta {filtro === 'pendentes' ? 'pendente' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}
