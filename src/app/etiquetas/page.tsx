'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Eye, QrCode, Loader2, Printer, RefreshCw, Server } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { usePiPrintBridgeConfig } from '@/hooks/usePiPrintBridgeConfig';
import { supabase } from '@/lib/supabase';
import {
  buscarOpcoesRemessaSepParaEtiquetas,
  type OpcaoRemessaSepEtiquetas,
} from '@/lib/services/etiquetas-opcoes-remessa';
import {
  aplicarMetadadosLoteProducaoNasRows,
  listarItemIdsRemessaSepOrdenados,
  upsertEtiquetasSeparacaoLoja,
} from '@/lib/services/etiquetas';
import {
  abrirPreviaEtiquetasEmJanela,
  confirmarImpressao,
  FORMATO_CONFIG,
  FORMATO_IMPRESSAO_STORAGE_KEY,
  FormatoEtiqueta,
  imprimirEtiquetasEmJobUnico,
  type EtiquetaParaImpressao,
} from '@/lib/printing/label-print';
import { enviarEtiquetasParaPiEmMultiplosJobs } from '@/lib/printing/pi-print-ws-client';
import {
  usuarioEtiquetasPodeImprimirZebra6060,
  usuarioIndustriaSemConsultaEstoque,
} from '@/lib/printing/etiquetas-usuario-industria';
import {
  gravarMatrizEtiquetasSession,
  idsMatrizEtiquetasPorNome,
  lerMatrizEtiquetasSession,
  origemIdParaMatrizEtiquetas,
  type MatrizOrigemEtiquetas,
} from '@/lib/printing/etiquetas-origem-matriz';
import type { Local } from '@/types/database';
import { lerUltimaRemessaPersistida } from '@/lib/separacao/ultima-remessa-storage';
import {
  type MetaTransferenciaRemessa,
  formatarDataHoraRemessaPt,
  loteSepResumidoParaUi,
  parseViagemIdDeLoteSep,
  truncarTexto,
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
  numero_sequencia_loja?: number | null;
  lote_producao_numero?: number | null;
  sequencia_no_lote_producao?: number | null;
  data_lote_producao?: string | null;
  num_baldes_lote_producao?: number | null;
  produto: { nome: string; validade_dias?: number; validade_horas?: number; validade_minutos?: number };
  item?: { id: string; token_qr: string; token_short: string | null } | null;
}

/** Data gravada na etiqueta/item; ignora sentinela «sem validade» usada no banco. */
function dataValidadeParaImpressaoEtiqueta(e: EtiquetaRow): string {
  const raw = String(e.data_validade || '').trim();
  if (!raw) return '';
  const ymd = raw.slice(0, 10);
  if (ymd.startsWith('2999')) return '';
  return e.data_validade;
}

/** Primeira tela e cada «Carregar mais» na lista de remessas SEP. */
const REMESSAS_SEP_POR_PAGINA = 7;

/** Máximo de etiquetas carregadas por remessa selecionada (uma viagem). */
const MAX_ETIQUETAS_POR_REMESSA = 6000;
const REFETCH_DEBOUNCE_ETIQUETAS_MS = 600;
const CHUNK_ITENS_TOKENS_ETIQUETAS = 400;

async function carregarItensTokensPorIds(
  ids: string[]
): Promise<Map<string, { token_qr: string; token_short: string | null }>> {
  const map = new Map<string, { token_qr: string; token_short: string | null }>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += CHUNK_ITENS_TOKENS_ETIQUETAS) {
    const slice = uniq.slice(i, i + CHUNK_ITENS_TOKENS_ETIQUETAS);
    const { data, error } = await supabase.from('itens').select('id, token_qr, token_short').in('id', slice);
    if (error) throw error;
    for (const row of data || []) {
      map.set(row.id as string, {
        token_qr: String((row as { token_qr?: string }).token_qr ?? ''),
        token_short: ((row as { token_short?: string | null }).token_short as string | null) ?? null,
      });
    }
  }
  return map;
}

function normalizarJoinUm<T>(valor: unknown): T | null {
  if (valor == null) return null;
  return (Array.isArray(valor) ? valor[0] : valor) as T | null;
}

/** Produto pode vir do join; tokens do item são preenchidos depois em lote (evita embed `itens!…` quebrado no PostgREST). */
function normalizarLinhaEtiquetaApi(row: Record<string, unknown>): EtiquetaRow {
  const produtoRaw = normalizarJoinUm<Record<string, unknown>>(row.produto);
  const produto = produtoRaw
    ? {
        nome: String(produtoRaw.nome ?? 'Produto'),
        validade_dias: produtoRaw.validade_dias as number | undefined,
        validade_horas: produtoRaw.validade_horas as number | undefined,
        validade_minutos: produtoRaw.validade_minutos as number | undefined,
      }
    : { nome: 'Produto' };

  const nSeq = row.numero_sequencia_loja;
  const nLoteP = row.lote_producao_numero;
  const nSeqL = row.sequencia_no_lote_producao;
  const nBaldes = row.num_baldes_lote_producao;
  return {
    id: String(row.id),
    produto_id: String(row.produto_id),
    data_producao: String(row.data_producao),
    data_validade: String(row.data_validade),
    lote: (row.lote as string | null) ?? null,
    impressa: Boolean(row.impressa),
    excluida: Boolean(row.excluida),
    created_at: String(row.created_at),
    numero_sequencia_loja:
      nSeq != null && Number.isFinite(Number(nSeq)) ? Number(nSeq) : null,
    lote_producao_numero:
      nLoteP != null && Number.isFinite(Number(nLoteP)) ? Number(nLoteP) : null,
    sequencia_no_lote_producao:
      nSeqL != null && Number.isFinite(Number(nSeqL)) ? Number(nSeqL) : null,
    data_lote_producao: row.data_lote_producao != null ? String(row.data_lote_producao) : null,
    num_baldes_lote_producao:
      nBaldes != null && Number.isFinite(Number(nBaldes)) ? Number(nBaldes) : null,
    produto,
    item: null,
  };
}

const DATA_SENTINELA_SEM_VALIDADE_ETIQUETA = '2999-12-31';

/** Linha compatível com `EtiquetaRow` para unidade da transferência que ainda não tem registro em `etiquetas`. */
function itemRowFantasmaParaEtiquetaRowSep(row: Record<string, unknown>, lote: string): EtiquetaRow {
  const produtoRaw = normalizarJoinUm<Record<string, unknown>>(row.produto);
  const produto = produtoRaw
    ? {
        nome: String(produtoRaw.nome ?? 'Produto'),
        validade_dias: produtoRaw.validade_dias as number | undefined,
        validade_horas: produtoRaw.validade_horas as number | undefined,
        validade_minutos: produtoRaw.validade_minutos as number | undefined,
      }
    : { nome: 'Produto' };
  const id = String(row.id);
  const dv =
    row.data_validade != null && String(row.data_validade).trim() !== ''
      ? String(row.data_validade)
      : DATA_SENTINELA_SEM_VALIDADE_ETIQUETA;
  const dp =
    row.data_producao != null && String(row.data_producao).trim() !== ''
      ? String(row.data_producao)
      : String(row.created_at);
  return {
    id,
    produto_id: String(row.produto_id),
    data_producao: dp,
    data_validade: dv,
    lote,
    impressa: false,
    excluida: false,
    created_at: String(row.created_at),
    numero_sequencia_loja: null,
    lote_producao_numero: null,
    sequencia_no_lote_producao: null,
    data_lote_producao: null,
    num_baldes_lote_producao: null,
    produto,
    item: {
      id,
      token_qr: String((row as { token_qr?: string }).token_qr ?? id),
      token_short: ((row as { token_short?: string | null }).token_short as string | null) ?? null,
    },
  };
}

async function carregarLinhasFantasmaItensParaSep(ids: string[], lote: string): Promise<EtiquetaRow[]> {
  const out: EtiquetaRow[] = [];
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += CHUNK_ITENS_TOKENS_ETIQUETAS) {
    const slice = uniq.slice(i, i + CHUNK_ITENS_TOKENS_ETIQUETAS);
    const { data, error } = await supabase
      .from('itens')
      .select(
        'id, produto_id, token_qr, token_short, data_validade, data_producao, created_at, produto:produtos(nome, validade_dias, validade_horas, validade_minutos)'
      )
      .in('id', slice);
    if (error) throw error;
    for (const row of data || []) {
      out.push(itemRowFantasmaParaEtiquetaRowSep(row as Record<string, unknown>, lote));
    }
  }
  return aplicarMetadadosLoteProducaoNasRows(out, supabase);
}

/**
 * Ordem de impressão 60×30: produtos com **mais unidades nesta lista** primeiro (blocos grandes);
 * SKUs com poucas etiquetas vão ao **final**, para não “cortar” um volume enorme no meio com um item solto.
 * Desempate: nome (pt-BR), depois `id`.
 */
function ordenarEtiquetasPorProdutoParaImpressao(lista: EtiquetaRow[]): EtiquetaRow[] {
  const porProdutoId = new Map<string, number>();
  for (const e of lista) {
    porProdutoId.set(e.produto_id, (porProdutoId.get(e.produto_id) ?? 0) + 1);
  }
  return [...lista].sort((a, b) => {
    const ca = porProdutoId.get(a.produto_id) ?? 0;
    const cb = porProdutoId.get(b.produto_id) ?? 0;
    if (ca !== cb) return cb - ca;
    const na = (a.produto?.nome || 'Produto').trim();
    const nb = (b.produto?.nome || 'Produto').trim();
    const c = na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
}

function rowsParaEtiquetasImpressao(
  lista: EtiquetaRow[],
  usuarioNome: string,
  nomeLojaOuLocal?: string | null,
  numerosPorItemId?: Map<string, number | null> | null
): EtiquetaParaImpressao[] {
  const loja = (nomeLojaOuLocal && String(nomeLojaOuLocal).trim()) || undefined;
  return lista.map((e) => {
    const numeroSequenciaLoja =
      numerosPorItemId != null
        ? (numerosPorItemId.get(e.id) ?? null)
        : (e.numero_sequencia_loja ?? null);
    return {
      id: e.id,
      produtoNome: e.produto?.nome || 'Produto',
      dataManipulacao: e.data_producao,
      dataValidade: dataValidadeParaImpressaoEtiqueta(e),
      lote: e.lote || '-',
      tokenQr: e.item?.token_qr || e.id,
      tokenShort: e.item?.token_short || e.id.slice(0, 8).toUpperCase(),
      responsavel: usuarioNome,
      nomeLoja: loja,
      dataGeracaoIso: e.created_at,
      numeroSequenciaLoja,
      loteProducaoNumero: e.lote_producao_numero ?? null,
      sequenciaNoLote: e.sequencia_no_lote_producao ?? null,
      numBaldesLoteProducao: e.num_baldes_lote_producao ?? null,
      dataLoteProducaoIso: e.data_lote_producao ?? null,
    };
  });
}

/** Antes de gerar HTML: grava `numero_sequencia_loja` no banco para baldes SEP-… (sequência por loja de destino). */
async function garantirNumerosSequenciaBaldeAntesImpressao(
  lista: EtiquetaRow[],
  destinoLocalId: string | null | undefined
): Promise<Map<string, number | null> | null> {
  if (lista.length === 0) return null;
  const lote = lista[0]?.lote?.trim();
  if (!lote || !lote.startsWith('SEP-')) return null;
  const destinoTrim = String(destinoLocalId || '').trim() || null;
  return upsertEtiquetasSeparacaoLoja(
    lista.map((e) => ({
      id: e.id,
      produto_id: e.produto_id,
      data_validade: e.data_validade,
    })),
    { lote, mode: 'manter_impressa_se_existir', local_destino_id: destinoTrim }
  );
}

export default function EtiquetasPage() {
  const { usuario } = useAuth();
  const { data: locais } = useRealtimeQuery<Local>({
    table: 'locais',
    orderBy: { column: 'nome', ascending: true },
  });
  const idsMatrizRemessa = useMemo(() => idsMatrizEtiquetasPorNome(locais), [locais]);

  const podeZebra6060Etiquetas = usuarioEtiquetasPodeImprimirZebra6060(usuario);
  /** Equipe estoque / demais logins: somente 60×30 no navegador (sem Pi). */
  const apenasNavegador6030 = !podeZebra6060Etiquetas;
  /** Indústria (ex. Leonardo): somente 60×60 na Zebra/Pi — sem impressão pelo navegador nesta tela. */
  const somenteZebra6060Industria = podeZebra6060Etiquetas;

  const transformEtiquetasDaApi = useCallback(async (rows: Record<string, unknown>[]): Promise<EtiquetaRow[]> => {
    const base = rows.map((row) => normalizarLinhaEtiquetaApi(row));
    const ids = [...new Set(base.map((e) => e.id))];
    if (ids.length === 0) return base;
    let tokens = new Map<string, { token_qr: string; token_short: string | null }>();
    try {
      tokens = await carregarItensTokensPorIds(ids);
    } catch (e) {
      console.warn('Etiquetas: não foi possível carregar tokens em itens (RLS ou rede); QR pode usar fallback.', e);
    }
    return base.map((e) => {
      const t = tokens.get(e.id);
      return {
        ...e,
        item: t ? { id: e.id, token_qr: t.token_qr, token_short: t.token_short } : null,
      };
    });
  }, []);

  const loginIndustriaEtiquetas = usuarioIndustriaSemConsultaEstoque(usuario);
  /** Qualquer operador de indústria: remessas SEP só da origem do `local_padrao_id` (não alternar para Estoque central). */
  const perfilOperadorIndustria =
    usuario?.perfil === 'OPERATOR_WAREHOUSE' || usuario?.perfil === 'OPERATOR_WAREHOUSE_DRIVER';
  const etiquetasSomenteOrigemLocalPadrao = perfilOperadorIndustria || loginIndustriaEtiquetas;
  const ocultarAtualizarListaRemessas =
    etiquetasSomenteOrigemLocalPadrao && Boolean(usuario?.local_padrao_id?.trim());
  const matrizBootstrapRef = useRef(false);
  const [matrizOrigemEtiquetas, setMatrizOrigemEtiquetas] = useState<MatrizOrigemEtiquetas>(() => {
    if (typeof window === 'undefined') return 'estoque';
    return lerMatrizEtiquetasSession() ?? 'estoque';
  });

  useEffect(() => {
    if (etiquetasSomenteOrigemLocalPadrao) return;
    if (matrizBootstrapRef.current) return;
    if (locais.length === 0) return;
    if (lerMatrizEtiquetasSession()) {
      matrizBootstrapRef.current = true;
      return;
    }
    const lp = usuario?.local_padrao_id?.trim();
    const { industriaId, estoqueId } = idsMatrizEtiquetasPorNome(locais);
    if (lp && lp === industriaId) setMatrizOrigemEtiquetas('industria');
    else if (lp && lp === estoqueId) setMatrizOrigemEtiquetas('estoque');
    matrizBootstrapRef.current = true;
  }, [etiquetasSomenteOrigemLocalPadrao, usuario?.local_padrao_id, locais]);

  const [opcoesRemessaTodas, setOpcoesRemessaTodas] = useState<OpcaoRemessaSepEtiquetas[]>([]);
  /** Quantas remessas mostrar no `<select>` (aumenta com «Carregar mais»). */
  const [limiteRemessasExibidas, setLimiteRemessasExibidas] = useState(REMESSAS_SEP_POR_PAGINA);
  const [carregandoOpcoesRemessa, setCarregandoOpcoesRemessa] = useState(true);
  const [erroOpcoesRemessa, setErroOpcoesRemessa] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<string | null>(null);

  const { opcoesRemessa, haMaisRemessasNaoExibidas } = useMemo(() => {
    const todas = opcoesRemessaTodas;
    if (todas.length === 0) {
      return { opcoesRemessa: [] as OpcaoRemessaSepEtiquetas[], haMaisRemessasNaoExibidas: false };
    }
    let lim = Math.min(limiteRemessasExibidas, todas.length);
    if (loteSelecionado) {
      const idx = todas.findIndex((o) => o.lote === loteSelecionado);
      if (idx >= 0) {
        lim = Math.max(lim, idx + 1);
      }
    }
    const opcoesRemessa = todas.slice(0, lim);
    return {
      opcoesRemessa,
      haMaisRemessasNaoExibidas: lim < todas.length,
    };
  }, [opcoesRemessaTodas, limiteRemessasExibidas, loteSelecionado]);

  const metaPorViagemId = useMemo(() => {
    const m = new Map<string, MetaTransferenciaRemessa>();
    for (const o of opcoesRemessaTodas) {
      const vid = parseViagemIdDeLoteSep(o.lote);
      if (!vid || !o.origemNome || !o.destinoNome) continue;
      m.set(vid, {
        origemNome: o.origemNome,
        destinoNome: o.destinoNome,
        destinoLocalId: o.destinoLocalId ?? null,
        createdAt: String(o.transferenciaCreatedAt || o.created_at),
        status: o.status ?? '',
      });
    }
    return m;
  }, [opcoesRemessaTodas]);

  /** Remessa SEP-…: loja de destino (ou origem) para não sair «—» no 60×30 e no bloco local do 60×60. */
  const nomeLojaOuLocalRemessa = useMemo(() => {
    if (!loteSelecionado) return undefined;
    const vid = parseViagemIdDeLoteSep(loteSelecionado);
    if (!vid) return undefined;
    const meta = metaPorViagemId.get(vid);
    const dest = meta?.destinoNome?.trim();
    if (dest) return dest;
    return meta?.origemNome?.trim() || undefined;
  }, [loteSelecionado, metaPorViagemId]);

  const filtrosEtiquetasRemessa = useMemo(() => {
    if (!loteSelecionado) return undefined;
    return [
      { column: 'lote', value: loteSelecionado },
      { column: 'excluida', value: false },
    ];
  }, [loteSelecionado]);

  const {
    data: etiquetas,
    loading: carregandoEtiquetasRemessa,
    error: erroQueryEtiquetas,
  } = useRealtimeQuery<EtiquetaRow>({
    table: 'etiquetas',
    select: '*, produto:produtos(nome, validade_dias, validade_horas, validade_minutos)',
    orderBy: { column: 'created_at', ascending: false },
    transform: transformEtiquetasDaApi,
    filters: filtrosEtiquetasRemessa,
    enabled: Boolean(loteSelecionado),
    maxRows: MAX_ETIQUETAS_POR_REMESSA,
    refetchDebounceMs: REFETCH_DEBOUNCE_ETIQUETAS_MS,
  });

  const etiquetasRef = useRef(etiquetas);
  etiquetasRef.current = etiquetas;

  const [linhasRemessa, setLinhasRemessa] = useState<EtiquetaRow[]>([]);
  const [mesclandoLinhasSep, setMesclandoLinhasSep] = useState(false);
  /** Só SEP: falha ao montar lista exclusivamente pela transferência (sem fallback em `etiquetas`). */
  const [erroListaTransferenciaSep, setErroListaTransferenciaSep] = useState('');

  useLayoutEffect(() => {
    const lote = loteSelecionado?.trim() ?? '';
    if (lote.toUpperCase().startsWith('SEP-')) {
      setMesclandoLinhasSep(true);
    } else {
      setMesclandoLinhasSep(false);
    }
  }, [loteSelecionado]);

  useEffect(() => {
    if (!loteSelecionado?.trim()) {
      setLinhasRemessa([]);
      setMesclandoLinhasSep(false);
      setErroListaTransferenciaSep('');
      return;
    }
    const lote = loteSelecionado.trim();
    if (!lote.toUpperCase().startsWith('SEP-')) {
      setLinhasRemessa(etiquetasRef.current);
      setMesclandoLinhasSep(false);
      setErroListaTransferenciaSep('');
      return;
    }

    let cancelled = false;
    setMesclandoLinhasSep(true);
    setErroListaTransferenciaSep('');
    setLinhasRemessa([]);

    void (async () => {
      try {
        const vidSep = parseViagemIdDeLoteSep(lote);
        const destinoLocalIdLista = vidSep ? metaPorViagemId.get(vidSep)?.destinoLocalId ?? null : null;
        const idsTransfer = await listarItemIdsRemessaSepOrdenados(lote, supabase, {
          destinoLocalId: destinoLocalIdLista,
        });
        if (cancelled) return;

        if (idsTransfer == null) {
          setLinhasRemessa([]);
          setErroListaTransferenciaSep(
            'Não foi possível ler a transferência matriz → loja desta viagem (transferências / itens da remessa). Sem essa leitura não exibimos lista de impressão — verifique rede, login e políticas RLS no Supabase, ou contate o suporte.'
          );
          return;
        }
        if (idsTransfer.length === 0) {
          setLinhasRemessa([]);
          setErroListaTransferenciaSep(
            'Esta viagem não tem unidades em transferência matriz → loja vinculadas. Se a separação foi registrada, há inconsistência no banco — contate o suporte.'
          );
          return;
        }

        const etiquetasAtual = etiquetasRef.current;
        const porId = new Map(etiquetasAtual.map((e) => [e.id, e]));
        const missing = idsTransfer.filter((id) => !porId.has(id));
        const synth =
          missing.length > 0 ? await carregarLinhasFantasmaItensParaSep(missing, lote) : [];
        if (cancelled) return;
        const synMap = new Map(synth.map((s) => [s.id, s]));
        const folha = idsTransfer
          .map((id) => porId.get(id) ?? synMap.get(id))
          .filter((x): x is EtiquetaRow => x != null);

        if (folha.length !== idsTransfer.length) {
          setLinhasRemessa([]);
          setErroListaTransferenciaSep(
            `A transferência indica ${idsTransfer.length} unidade(s), mas só ${folha.length} puderam ser montadas (linhas em etiquetas + consulta a itens). Ajuste permissões de leitura ou dados em Supabase — a lista de impressão exige as ${idsTransfer.length} unidades.`
          );
          return;
        }

        setErroListaTransferenciaSep('');
        setLinhasRemessa(folha);
      } catch (err: unknown) {
        if (!cancelled) {
          setLinhasRemessa([]);
          setErroListaTransferenciaSep(
            err instanceof Error
              ? err.message
              : 'Falha ao montar a lista da remessa a partir da transferência.'
          );
        }
      } finally {
        if (!cancelled) setMesclandoLinhasSep(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loteSelecionado, etiquetas, metaPorViagemId]);

  const [formatoImpressao, setFormatoImpressao] = useState<FormatoEtiqueta>('60x30');
  /** Indústria: sempre 60×60 + Pi; estoque: 60×30 navegador. */
  const mostrarZebra6060 = somenteZebra6060Industria;
  const piIndustria = usePiPrintBridgeConfig({ papel: 'industria', enabled: somenteZebra6060Industria });
  const piCfgLoading = somenteZebra6060Industria ? piIndustria.loading : false;
  const piConnection = somenteZebra6060Industria ? piIndustria.connection : null;
  const piPrintAvailable = Boolean(piConnection);
  const [printing, setPrinting] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [erroImpressao, setErroImpressao] = useState('');
  const [avisoHttpsPi, setAvisoHttpsPi] = useState(false);

  /**
   * Recorte por origem da transferência (UUID do warehouse matriz).
   * - Leonardo / login indústria: só `local_padrao_id` (indústria), sem alternar para Estoque.
   * - Demais: seletor Estoque × Indústria (`matrizOrigemEtiquetas`) + resolução por nome em `locais`.
   */
  const origemIdOpcoesRemessa = useMemo(() => {
    if (etiquetasSomenteOrigemLocalPadrao) {
      const id = usuario?.local_padrao_id?.trim();
      return id || undefined;
    }
    return origemIdParaMatrizEtiquetas(matrizOrigemEtiquetas, idsMatrizRemessa);
  }, [etiquetasSomenteOrigemLocalPadrao, usuario?.local_padrao_id, matrizOrigemEtiquetas, idsMatrizRemessa]);

  /** Estoque: 60×30; indústria: 60×60 (sem restaurar formato salvo — evita 60×60 no estoque após uso do Leonardo no mesmo aparelho). */
  useLayoutEffect(() => {
    if (apenasNavegador6030) {
      setFormatoImpressao('60x30');
      return;
    }
    if (somenteZebra6060Industria) {
      setFormatoImpressao('60x60');
    }
  }, [apenasNavegador6030, somenteZebra6060Industria]);

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

  const carregarOpcoesRemessa = useCallback(async () => {
    setCarregandoOpcoesRemessa(true);
    setErroOpcoesRemessa('');
    if (etiquetasSomenteOrigemLocalPadrao && !usuario?.local_padrao_id?.trim()) {
      setOpcoesRemessaTodas([]);
      setLimiteRemessasExibidas(REMESSAS_SEP_POR_PAGINA);
      setCarregandoOpcoesRemessa(false);
      return;
    }
    try {
      const opcoes = await buscarOpcoesRemessaSepParaEtiquetas({
        origemId: origemIdOpcoesRemessa,
        /** Operador indústria / logins 60×60: todas as remessas SEP da origem (`local_padrao_id`). */
      });
      setOpcoesRemessaTodas(opcoes);
      setLimiteRemessasExibidas(REMESSAS_SEP_POR_PAGINA);
    } catch (err: unknown) {
      setErroOpcoesRemessa(err instanceof Error ? err.message : 'Não foi possível listar remessas');
      setOpcoesRemessaTodas([]);
      setLimiteRemessasExibidas(REMESSAS_SEP_POR_PAGINA);
    } finally {
      setCarregandoOpcoesRemessa(false);
    }
  }, [etiquetasSomenteOrigemLocalPadrao, origemIdOpcoesRemessa, usuario?.local_padrao_id]);

  useEffect(() => {
    void carregarOpcoesRemessa();
  }, [carregarOpcoesRemessa]);

  useEffect(() => {
    if (opcoesRemessaTodas.length === 0) {
      setLoteSelecionado(null);
      return;
    }
    setLoteSelecionado((prev) => {
      if (prev && opcoesRemessaTodas.some((o) => o.lote === prev)) return prev;
      const salva = lerUltimaRemessaPersistida();
      if (salva && opcoesRemessaTodas.some((o) => o.lote === salva.lote)) return salva.lote;
      return null;
    });
  }, [opcoesRemessaTodas]);

  function rotuloOpcaoRemessaNoTopo(o: OpcaoRemessaSepEtiquetas): string {
    if (o.origemNome && o.destinoNome) {
      const dataIso = o.transferenciaCreatedAt || o.created_at;
      return `${formatarDataHoraRemessaPt(dataIso)} · ${truncarTexto(o.origemNome, 18)} → ${truncarTexto(o.destinoNome, 18)}`;
    }
    return `${formatarDataHoraRemessaPt(o.created_at)} · ${loteSepResumidoParaUi(o.lote)}`;
  }

  const imprimirLista = async (lista: EtiquetaRow[]) => {
    if (lista.length === 0) return;
    if (somenteZebra6060Industria) {
      setErroImpressao('Nesta conta use apenas a impressão Zebra 60×60 (botões com ícone de servidor).');
      return;
    }
    if (!confirmarImpressao(lista.length, formatoImpressao)) return;

    setPrinting(true);
    setErroImpressao('');

    try {
      const ordenada = ordenarEtiquetasPorProdutoParaImpressao(lista);
      const vid = parseViagemIdDeLoteSep(ordenada[0]?.lote);
      const destinoLocalId = vid ? metaPorViagemId.get(vid)?.destinoLocalId ?? null : null;
      const numerosMap = await garantirNumerosSequenciaBaldeAntesImpressao(ordenada, destinoLocalId);
      const ordenadaMeta = await aplicarMetadadosLoteProducaoNasRows(ordenada, supabase);

      const sucesso = await imprimirEtiquetasEmJobUnico(
        rowsParaEtiquetasImpressao(
          ordenadaMeta,
          usuario?.nome || 'OPERADOR',
          nomeLojaOuLocalRemessa,
          numerosMap
        ),
        formatoImpressao,
        formatoImpressao === '60x30' ? { preparar60x30PilhasPorLado: true } : undefined
      );

      if (!sucesso) {
        throw new Error('Não foi possível abrir a janela de impressão. Libere pop-ups e tente novamente.');
      }
    } catch (err: unknown) {
      setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir etiquetas');
    } finally {
      setPrinting(false);
    }
  };

  const imprimirListaNoPi = async (lista: EtiquetaRow[]) => {
    if (lista.length === 0) return;
    if (!podeZebra6060Etiquetas) {
      alert('Impressão na Zebra 60×60 está disponível apenas para o login da indústria.');
      return;
    }
    if (formatoImpressao !== '60x60') {
      alert('Zebra/Pi: selecione o formato 60×60 mm.');
      return;
    }
    if (!piPrintAvailable || !piConnection) {
      alert(
        'Impressão 60×60 na estação: configure a ponte indústria em Configurações → Impressoras ou NEXT_PUBLIC_PI_PRINT_WS_URL_INDUSTRIA. Veja docs/RASPBERRY_INDUSTRIA_NOVO_PI.md.'
      );
      return;
    }
    if (!confirmarImpressao(lista.length, formatoImpressao)) return;

    setPrinting(true);
    setErroImpressao('');
    const jobName = `etiquetas-${lista[0]?.lote || lista[0]?.id || 'lote'}`.slice(0, 120);

    try {
      const vid = parseViagemIdDeLoteSep(lista[0]?.lote);
      const destinoLocalId = vid ? metaPorViagemId.get(vid)?.destinoLocalId ?? null : null;
      const numerosMap = await garantirNumerosSequenciaBaldeAntesImpressao(lista, destinoLocalId);
      const listaMeta = await aplicarMetadadosLoteProducaoNasRows(lista, supabase);

      const etiquetas = rowsParaEtiquetasImpressao(
        listaMeta,
        usuario?.nome || 'OPERADOR',
        nomeLojaOuLocalRemessa,
        numerosMap
      );
      await enviarEtiquetasParaPiEmMultiplosJobs(etiquetas, formatoImpressao, {
        jobNameBase: jobName,
        connection: piConnection,
        papel: 'industria',
      });
    } catch (err: unknown) {
      setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir na estação Pi');
    } finally {
      setPrinting(false);
    }
  };

  const prepararListaMesmaOrdemImpressao = useCallback(
    (lista: EtiquetaRow[]) =>
      formatoImpressao === '60x30'
        ? ordenarEtiquetasPorProdutoParaImpressao(lista)
        : [...lista],
    [formatoImpressao]
  );

  const previsualizarEtiquetas = useCallback(
    async (lista: EtiquetaRow[]) => {
      if (lista.length === 0) return;
      setPrevisualizando(true);
      setErroImpressao('');
      try {
        const ordenada = prepararListaMesmaOrdemImpressao(lista);
        /** Só leitura: não chama upsert/RPC no Supabase (evita falha com RLS ou login sem escrita em `etiquetas`). Imprimir remessa continua gravando números antes da folha. */
        const ordenadaMeta = await aplicarMetadadosLoteProducaoNasRows(ordenada, supabase);
        const payload = rowsParaEtiquetasImpressao(
          ordenadaMeta,
          usuario?.nome || 'OPERADOR',
          nomeLojaOuLocalRemessa,
          null
        );
        const mensagemBarra = somenteZebra6060Industria
          ? 'O Pi/Zebra recebe este mesmo layout. Feche a aba após conferir e use o botão Zebra 60×60.'
          : formatoImpressao === '60x30'
            ? 'O navegador imprimirá nesta ordem, com pares 60×30 por folha (pilhas por lado).'
            : undefined;
        const ok = await abrirPreviaEtiquetasEmJanela(payload, formatoImpressao, {
          preparar60x30PilhasPorLado: formatoImpressao === '60x30' ? true : undefined,
          mensagemBarra,
        });
        if (!ok) {
          throw new Error('Não foi possível abrir a prévia. Libere pop-ups e tente novamente.');
        }
      } catch (err: unknown) {
        setErroImpressao(err instanceof Error ? err.message : 'Falha ao gerar prévia');
      } finally {
        setPrevisualizando(false);
      }
    },
    [
      formatoImpressao,
      nomeLojaOuLocalRemessa,
      prepararListaMesmaOrdemImpressao,
      somenteZebra6060Industria,
      usuario?.nome,
    ]
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Etiquetas</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <select
            value={formatoImpressao}
            onChange={(event) => setFormatoImpressao(event.target.value as FormatoEtiqueta)}
            disabled
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100 disabled:text-gray-700"
            aria-label="Formato de impressão"
            title={
              apenasNavegador6030
                ? 'Equipe estoque: impressão apenas 60×30 mm pelo navegador'
                : 'Indústria: impressão apenas Zebra 60×60 mm (Pi)'
            }
          >
            {(apenasNavegador6030 ? (['60x30'] as const) : (['60x60'] as const)).map((formato) => (
              <option key={formato} value={formato}>
                {FORMATO_CONFIG[formato].label}
              </option>
            ))}
          </select>
          {loteSelecionado &&
            !carregandoEtiquetasRemessa &&
            !mesclandoLinhasSep &&
            linhasRemessa.length > 0 && (
            <>
              {!somenteZebra6060Industria && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void previsualizarEtiquetas(linhasRemessa)}
                    disabled={previsualizando || printing}
                    className="w-full sm:w-auto"
                  >
                    {previsualizando ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    Ver prévia
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void imprimirLista(linhasRemessa)}
                    disabled={printing}
                    className="w-full sm:w-auto"
                  >
                    {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                    Imprimir remessa
                  </Button>
                </>
              )}
              {mostrarZebra6060 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void previsualizarEtiquetas(linhasRemessa)}
                    disabled={previsualizando || printing}
                    className="w-full sm:w-auto border-emerald-800/40 text-emerald-950"
                  >
                    {previsualizando ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    Ver prévia
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void imprimirListaNoPi(linhasRemessa)}
                    disabled={printing || piCfgLoading || !piPrintAvailable}
                    title={
                      !piPrintAvailable && !piCfgLoading
                        ? 'Configure em Configurações → Impressoras'
                        : 'Zebra 60×60 via Pi indústria'
                    }
                    className="w-full sm:w-auto border-emerald-600 bg-emerald-700 hover:bg-emerald-800 text-white"
                  >
                    {printing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Server className="w-4 h-4 mr-2" />
                    )}
                    Imprimir remessa (Zebra)
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {mostrarZebra6060 && avisoHttpsPi && (
        <p className="mb-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Esta página está em <strong>HTTPS</strong> e a URL do Pi usa <strong>ws://</strong> — o navegador pode bloquear
          a ponte. Use <strong>wss://</strong> no túnel ou teste em <code className="text-[11px]">http://localhost</code>{' '}
          na mesma rede.
        </p>
      )}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        {etiquetasSomenteOrigemLocalPadrao ? (
          usuario?.local_padrao_id?.trim() ? (
            <p className="text-xs text-gray-700 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <span className="font-semibold text-gray-900">Origem:</span> somente remessas com saída do{' '}
              <strong>seu local</strong> (indústria / armazém vinculado ao usuário) — não é possível alternar para o
              estoque central nesta conta.
            </p>
          ) : (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Para listar apenas remessas da <strong>indústria</strong>, defina o <strong>local padrão</strong> do
              operador em{' '}
              <Link href="/cadastros/usuarios" className="text-red-700 font-medium underline underline-offset-2">
                Cadastros → Usuários
              </Link>{' '}
              e entre de novo.
            </p>
          )
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-slate-50/80 border border-slate-100 px-3 py-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-sm font-semibold text-gray-800 shrink-0">Matriz de origem</span>
              <select
                value={matrizOrigemEtiquetas}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== 'industria' && v !== 'estoque') return;
                  setMatrizOrigemEtiquetas(v);
                  gravarMatrizEtiquetasSession(v);
                }}
                className="w-full sm:max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                aria-label="Matriz de origem das remessas"
              >
                <option value="estoque">Estoque (central)</option>
                <option value="industria">Indústria</option>
              </select>
            </div>
            {matrizOrigemEtiquetas === 'estoque' && !idsMatrizRemessa.estoqueId && (
              <p className="text-xs text-amber-900">
                Não há warehouse ativo reconhecido como <strong>Estoque</strong> no cadastro — a lista pode incluir todas as
                origens. Confira nomes em{' '}
                <Link href="/cadastros/locais" className="text-red-700 font-medium underline underline-offset-2">
                  Cadastros → Locais
                </Link>
                .
              </p>
            )}
            {matrizOrigemEtiquetas === 'industria' && !idsMatrizRemessa.industriaId && (
              <p className="text-xs text-amber-900">
                Não há warehouse ativo reconhecido como <strong>Indústria</strong>. Ajuste em{' '}
                <Link href="/cadastros/locais" className="text-red-700 font-medium underline underline-offset-2">
                  Locais
                </Link>
                .
              </p>
            )}
          </div>
        )}
        <label className="block text-sm font-semibold text-gray-800">
          Remessa
          <div className="mt-1 flex flex-col sm:flex-row gap-2">
            <select
              value={loteSelecionado ?? ''}
              onChange={(ev) => setLoteSelecionado(ev.target.value || null)}
              disabled={carregandoOpcoesRemessa || opcoesRemessaTodas.length === 0}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100"
              aria-label="Selecionar remessa"
            >
              <option value="">
                {carregandoOpcoesRemessa ? 'Carregando remessas…' : '— Escolha uma remessa —'}
              </option>
              {opcoesRemessa.map((o) => (
                <option key={o.lote} value={o.lote}>
                  {rotuloOpcaoRemessaNoTopo(o)}
                </option>
              ))}
            </select>
            {haMaisRemessasNaoExibidas && (
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={carregandoOpcoesRemessa}
                onClick={() => setLimiteRemessasExibidas((n) => n + REMESSAS_SEP_POR_PAGINA)}
              >
                Carregar mais
              </Button>
            )}
            {!ocultarAtualizarListaRemessas && (
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={carregandoOpcoesRemessa}
                onClick={() => void carregarOpcoesRemessa()}
              >
                {carregandoOpcoesRemessa ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Atualizar lista
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Atualizar lista
                  </>
                )}
              </Button>
            )}
          </div>
        </label>
        {!carregandoOpcoesRemessa && opcoesRemessaTodas.length > 0 && (
          <p className="text-xs text-gray-500">
            Mostrando {opcoesRemessa.length} de {opcoesRemessaTodas.length} remessa{opcoesRemessaTodas.length === 1 ? '' : 's'}
            {haMaisRemessasNaoExibidas ? ' — use Carregar mais para as anteriores.' : '.'}
          </p>
        )}
        {erroOpcoesRemessa && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{erroOpcoesRemessa}</p>
        )}
        {!carregandoOpcoesRemessa && opcoesRemessaTodas.length === 0 && (
          <p className="text-xs text-gray-600">
            {etiquetasSomenteOrigemLocalPadrao && !usuario?.local_padrao_id?.trim() ? (
              <>
                Com o perfil de indústria, a lista depende do <strong>local padrão</strong> cadastrado. Ajuste em{' '}
                <Link href="/cadastros/usuarios" className="text-red-600 underline">
                  Cadastros → Usuários
                </Link>{' '}
                e entre de novo.
              </>
            ) : etiquetasSomenteOrigemLocalPadrao ? (
              <>
                Nenhuma remessa <code className="text-[10px]">SEP-…</code> com origem no seu local. Registre em{' '}
                <Link href="/separar-por-loja" className="text-red-600 underline">
                  Separar por Loja
                </Link>{' '}
                a partir deste armazém.
              </>
            ) : origemIdOpcoesRemessa ? (
              <>
                Nenhuma remessa <code className="text-[10px]">SEP-…</code> com origem na matriz{' '}
                <strong>{matrizOrigemEtiquetas === 'industria' ? 'Indústria' : 'Estoque'}</strong> (filtro atual). Troque
                «Matriz de origem» acima ou registre uma separação em{' '}
                <Link href="/separar-por-loja" className="text-red-600 underline">
                  Separar por Loja
                </Link>
                .
              </>
            ) : (
              <>
                Nenhuma remessa <code className="text-[10px]">SEP-…</code> encontrada nas etiquetas recentes. Registre uma
                separação em <Link href="/separar-por-loja" className="text-red-600 underline">Separar por Loja</Link>.
              </>
            )}
          </p>
        )}
      </div>

      {erroQueryEtiquetas && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Erro ao carregar etiquetas:</strong> {erroQueryEtiquetas.message}
          <p className="text-xs mt-2 text-red-700">
            Se a mensagem citar relacionamento ou FK, aplique a migração{' '}
            <code className="text-[11px]">20260408120000_etiquetas_fkey_itens_embed.sql</code> no Supabase.
          </p>
        </div>
      )}

      {erroImpressao && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erroImpressao}
        </div>
      )}

      {loteSelecionado?.trim().toUpperCase().startsWith('SEP-') &&
        erroListaTransferenciaSep &&
        !carregandoEtiquetasRemessa &&
        !mesclandoLinhasSep && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Remessa SEP — lista da separação:</strong> {erroListaTransferenciaSep}
        </div>
      )}

      {loteSelecionado && mostrarZebra6060 && !piCfgLoading && !piPrintAvailable && (
        <p className="mb-4 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Impressão 60×60 na estação indisponível: configure a ponte indústria em Configurações → Impressoras (veja a
          documentação do Raspberry).
        </p>
      )}

      {loteSelecionado &&
        !carregandoEtiquetasRemessa &&
        !mesclandoLinhasSep &&
        !erroQueryEtiquetas &&
        linhasRemessa.length === 0 &&
        !erroListaTransferenciaSep && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>
            Nenhuma linha de etiqueta para este lote. Confira a separação em{' '}
            <Link href="/separar-por-loja" className="font-medium text-red-700 underline underline-offset-2">
              Separar por Loja
            </Link>{' '}
            ou contate o suporte se a remessa deveria ter unidades.
          </p>
        </div>
      )}

      {!loteSelecionado && (
        <div className="text-center py-16 px-4 text-gray-500 border border-dashed border-gray-200 rounded-xl bg-gray-50/80">
          <QrCode className="w-14 h-14 mx-auto mb-4 opacity-40" />
          <p className="font-medium text-gray-800">Escolha uma remessa acima</p>
        </div>
      )}

      {loteSelecionado &&
        (carregandoEtiquetasRemessa || mesclandoLinhasSep) &&
        !erroQueryEtiquetas && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
          <p className="text-sm">
            {carregandoEtiquetasRemessa
              ? 'Carregando etiquetas desta remessa…'
              : 'Carregando unidades da separação (remessa SEP)…'}
          </p>
        </div>
      )}

      {loteSelecionado &&
        !carregandoEtiquetasRemessa &&
        !mesclandoLinhasSep &&
        !erroQueryEtiquetas &&
        linhasRemessa.length > 0 && (
        <p className="mb-4 text-sm text-gray-700 rounded-lg border border-gray-100 bg-gray-50/90 px-4 py-3">
          <strong>{linhasRemessa.length}</strong> etiqueta{linhasRemessa.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
