'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Eye, QrCode, Loader2, Printer, RefreshCw, Server, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { usePiPrintBridgeConfig } from '@/hooks/usePiPrintBridgeConfig';
import { supabase } from '@/lib/supabase';
import {
  buscarOpcoesRemessaSepParaEtiquetas,
  type OpcaoRemessaSepEtiquetas,
} from '@/lib/services/etiquetas-opcoes-remessa';
import { contarUnidadesTransferenciaPorLoteSep, upsertEtiquetasSeparacaoLoja } from '@/lib/services/etiquetas';
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
  dataReferenciaRemessa,
  formatarDataHoraRemessaPt,
  loteSepResumidoParaUi,
  parseViagemIdDeLoteSep,
  resumoProdutosRemessa,
  statusTransferenciaLegivel,
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

/** Data gravada na etiqueta/item; ignora sentinela «sem validade» usada no banco. */
function dataValidadeParaImpressaoEtiqueta(e: EtiquetaRow): string {
  const raw = String(e.data_validade || '').trim();
  if (!raw) return '';
  const ymd = raw.slice(0, 10);
  if (ymd.startsWith('2999')) return '';
  return e.data_validade;
}

/** Máximo de etiquetas carregadas por remessa selecionada (uma viagem). */
const MAX_ETIQUETAS_POR_REMESSA = 6000;
/** Por grupo: renderiza só as N primeiras até expandir (evita milhares de nós no DOM). */
const ETIQUETAS_VISIVEIS_POR_GRUPO = 50;
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
    produto,
    item: null,
  };
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

function compararEtiquetasNoGrupoUi(a: EtiquetaRow, b: EtiquetaRow): number {
  const na = a.numero_sequencia_loja;
  const nb = b.numero_sequencia_loja;
  const aOk = na != null && Number.isFinite(Number(na));
  const bOk = nb != null && Number.isFinite(Number(nb));
  if (aOk && bOk && Number(na) !== Number(nb)) return Number(na) - Number(nb);
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;
  return a.id.localeCompare(b.id);
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
  const matrizBootstrapRef = useRef(false);
  const [matrizOrigemEtiquetas, setMatrizOrigemEtiquetas] = useState<MatrizOrigemEtiquetas>(() => {
    if (typeof window === 'undefined') return 'estoque';
    return lerMatrizEtiquetasSession() ?? 'estoque';
  });

  useEffect(() => {
    if (loginIndustriaEtiquetas) return;
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
  }, [loginIndustriaEtiquetas, usuario?.local_padrao_id, locais]);

  const [opcoesRemessa, setOpcoesRemessa] = useState<OpcaoRemessaSepEtiquetas[]>([]);
  const [carregandoOpcoesRemessa, setCarregandoOpcoesRemessa] = useState(true);
  const [erroOpcoesRemessa, setErroOpcoesRemessa] = useState('');
  const [loteSelecionado, setLoteSelecionado] = useState<string | null>(null);
  const [unidadesNaTransferencia, setUnidadesNaTransferencia] = useState<number | null>(null);

  const metaPorViagemId = useMemo(() => {
    const m = new Map<string, MetaTransferenciaRemessa>();
    for (const o of opcoesRemessa) {
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
  }, [opcoesRemessa]);

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
    refetch: refetchEtiquetasRemessa,
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

  const [filtro, setFiltro] = useState<'todas' | 'pendentes' | 'impressas'>('pendentes');
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
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(() => new Set());
  const [sincronizandoEtiquetasRemessa, setSincronizandoEtiquetasRemessa] = useState(false);
  const [erroSincEtiquetasRemessa, setErroSincEtiquetasRemessa] = useState('');
  const [sucessoSincEtiquetasRemessa, setSucessoSincEtiquetasRemessa] = useState('');
  const [loginParaSyncRemessa, setLoginParaSyncRemessa] = useState('');
  const [senhaParaSyncRemessa, setSenhaParaSyncRemessa] = useState('');

  /**
   * Recorte por origem da transferência (UUID do warehouse matriz).
   * - Leonardo / login indústria: só `local_padrao_id` (indústria), sem alternar para Estoque.
   * - Demais: seletor Estoque × Indústria (`matrizOrigemEtiquetas`) + resolução por nome em `locais`.
   */
  const origemIdOpcoesRemessa = useMemo(() => {
    if (loginIndustriaEtiquetas) {
      const id = usuario?.local_padrao_id?.trim();
      return id || undefined;
    }
    return origemIdParaMatrizEtiquetas(matrizOrigemEtiquetas, idsMatrizRemessa);
  }, [loginIndustriaEtiquetas, usuario?.local_padrao_id, matrizOrigemEtiquetas, idsMatrizRemessa]);

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
    try {
      const opcoes = await buscarOpcoesRemessaSepParaEtiquetas({
        origemId: origemIdOpcoesRemessa,
        /** Indústria (Leonardo / logins 60×60): todas as remessas SEP da origem (`local_padrao_id`), como nas demais telas da indústria. */
      });
      setOpcoesRemessa(opcoes);
    } catch (err: unknown) {
      setErroOpcoesRemessa(err instanceof Error ? err.message : 'Não foi possível listar remessas');
      setOpcoesRemessa([]);
    } finally {
      setCarregandoOpcoesRemessa(false);
    }
  }, [origemIdOpcoesRemessa]);

  useEffect(() => {
    void carregarOpcoesRemessa();
  }, [carregarOpcoesRemessa]);

  useEffect(() => {
    setErroSincEtiquetasRemessa('');
    setSucessoSincEtiquetasRemessa('');
    setSenhaParaSyncRemessa('');
    const op = usuario?.login_operacional?.trim();
    setLoginParaSyncRemessa(op ?? '');
  }, [loteSelecionado, usuario?.login_operacional]);

  const sincronizarEtiquetasDaTransferencia = useCallback(async () => {
    if (!loteSelecionado) return;
    const loginOp = loginParaSyncRemessa.trim().toLowerCase();
    const senha = senhaParaSyncRemessa;
    if (!loginOp) {
      setErroSincEtiquetasRemessa('Informe o login operacional (o mesmo da tela de entrada).');
      return;
    }
    if (!senha) {
      setErroSincEtiquetasRemessa('Informe a senha.');
      return;
    }
    setSincronizandoEtiquetasRemessa(true);
    setErroSincEtiquetasRemessa('');
    setSucessoSincEtiquetasRemessa('');
    try {
      const res = await fetch('/api/operacional/sync-etiquetas-remessa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loteSep: loteSelecionado, login: loginOp, senha }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; n?: number };
      if (!res.ok) {
        throw new Error(payload.error || 'Falha ao sincronizar etiquetas');
      }
      const n = typeof payload.n === 'number' ? payload.n : 0;
      setSenhaParaSyncRemessa('');
      await refetchEtiquetasRemessa();
      const nTr = await contarUnidadesTransferenciaPorLoteSep(loteSelecionado);
      setUnidadesNaTransferencia(nTr);
      setSucessoSincEtiquetasRemessa(
        n > 0
          ? `${n} etiqueta(s) gravadas. A lista abaixo deve atualizar em instantes.`
          : 'Nenhuma linha gravada (confira se a remessa tem unidades na transferência).'
      );
    } catch (err: unknown) {
      setErroSincEtiquetasRemessa(err instanceof Error ? err.message : 'Falha ao sincronizar etiquetas');
    } finally {
      setSincronizandoEtiquetasRemessa(false);
    }
  }, [loteSelecionado, loginParaSyncRemessa, senhaParaSyncRemessa, refetchEtiquetasRemessa]);

  useEffect(() => {
    if (!sucessoSincEtiquetasRemessa) return;
    const t = setTimeout(() => setSucessoSincEtiquetasRemessa(''), 10000);
    return () => clearTimeout(t);
  }, [sucessoSincEtiquetasRemessa]);

  useEffect(() => {
    if (opcoesRemessa.length === 0) {
      setLoteSelecionado(null);
      return;
    }
    setLoteSelecionado((prev) => {
      if (prev && opcoesRemessa.some((o) => o.lote === prev)) return prev;
      const salva = lerUltimaRemessaPersistida();
      if (salva && opcoesRemessa.some((o) => o.lote === salva.lote)) return salva.lote;
      return null;
    });
  }, [opcoesRemessa]);

  useEffect(() => {
    if (!loteSelecionado) {
      setUnidadesNaTransferencia(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const n = await contarUnidadesTransferenciaPorLoteSep(loteSelecionado);
      if (!cancelled) setUnidadesNaTransferencia(n);
    })();
    return () => {
      cancelled = true;
    };
  }, [loteSelecionado]);

  const remessaBulkContexto = useMemo(() => {
    if (!loteSelecionado) return null;
    const entry = {
      lote: loteSelecionado,
      rows: etiquetas,
      maisRecente:
        etiquetas.length > 0
          ? Math.max(...etiquetas.map((r) => new Date(r.created_at).getTime()))
          : 0,
    };
    const vid = parseViagemIdDeLoteSep(loteSelecionado);
    const meta = vid ? metaPorViagemId.get(vid) : undefined;
    return { entry, meta, vid };
  }, [loteSelecionado, etiquetas, metaPorViagemId]);

  const linhasRemessaBulk = etiquetas;
  const pendentesRemessaBulk = useMemo(
    () => linhasRemessaBulk.filter((e) => !e.impressa).length,
    [linhasRemessaBulk]
  );

  function rotuloOpcaoRemessaNoTopo(o: OpcaoRemessaSepEtiquetas): string {
    if (o.origemNome && o.destinoNome) {
      const dataIso = o.transferenciaCreatedAt || o.created_at;
      return `${formatarDataHoraRemessaPt(dataIso)} · ${truncarTexto(o.origemNome, 18)} → ${truncarTexto(o.destinoNome, 18)}`;
    }
    return `${formatarDataHoraRemessaPt(o.created_at)} · ${loteSepResumidoParaUi(o.lote)}`;
  }

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
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        etiquetas: [...g.etiquetas].sort(compararEtiquetasNoGrupoUi),
      }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return a.produtoNome.localeCompare(b.produtoNome, 'pt-BR', { sensitivity: 'base' });
      });
  }, [filtradas]);

  const marcarImpressa = async (ids: string[]) => {
    const { error } = await supabase.from('etiquetas').update({ impressa: true }).in('id', ids);
    if (error) throw error;
    await refetchEtiquetasRemessa();
  };

  const excluir = async (id: string) => {
    await supabase.from('etiquetas').update({ excluida: true }).eq('id', id);
    await refetchEtiquetasRemessa();
    void carregarOpcoesRemessa();
  };

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

      const sucesso = await imprimirEtiquetasEmJobUnico(
        rowsParaEtiquetasImpressao(
          ordenada,
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

      await marcarImpressa(ordenada.map((e) => e.id));
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

      const etiquetas = rowsParaEtiquetasImpressao(
        lista,
        usuario?.nome || 'OPERADOR',
        nomeLojaOuLocalRemessa,
        numerosMap
      );
      await enviarEtiquetasParaPiEmMultiplosJobs(etiquetas, formatoImpressao, {
        jobNameBase: jobName,
        connection: piConnection,
        papel: 'industria',
      });
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

  const imprimirRemessaInteiraNavegador = async (lista: EtiquetaRow[]) => {
    if (lista.length === 0) return;
    if (somenteZebra6060Industria) {
      setErroImpressao('Nesta conta use apenas a impressão Zebra 60×60 (Pi indústria).');
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

      const ok = await imprimirEtiquetasEmJobUnico(
        rowsParaEtiquetasImpressao(
          ordenada,
          usuario?.nome || 'OPERADOR',
          nomeLojaOuLocalRemessa,
          numerosMap
        ),
        formatoImpressao,
        formatoImpressao === '60x30' ? { preparar60x30PilhasPorLado: true } : undefined
      );
      if (!ok) {
        throw new Error('Não foi possível abrir a janela de impressão. Libere pop-ups e tente novamente.');
      }
      await marcarImpressa(ordenada.map((e) => e.id));
    } catch (err: unknown) {
      setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir remessa no navegador');
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
        const vid = parseViagemIdDeLoteSep(ordenada[0]?.lote);
        const destinoLocalId = vid ? metaPorViagemId.get(vid)?.destinoLocalId ?? null : null;
        const numerosMap = await garantirNumerosSequenciaBaldeAntesImpressao(ordenada, destinoLocalId);
        const payload = rowsParaEtiquetasImpressao(
          ordenada,
          usuario?.nome || 'OPERADOR',
          nomeLojaOuLocalRemessa,
          numerosMap
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
      metaPorViagemId,
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
            filtradas.filter((e) => !e.impressa).length > 0 && (
            <>
              {!somenteZebra6060Industria && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void previsualizarEtiquetas(filtradas.filter((e) => !e.impressa))
                    }
                    disabled={previsualizando || printing}
                    className="w-full sm:w-auto"
                    title="Abre uma nova aba com o layout exato antes de imprimir"
                  >
                    {previsualizando ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    Ver prévia
                  </Button>
                  <Button variant="primary" onClick={() => void imprimirPendentes()} disabled={printing} className="w-full sm:w-auto">
                    {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                    Imprimir pendentes
                  </Button>
                </>
              )}
              {mostrarZebra6060 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void previsualizarEtiquetas(filtradas.filter((e) => !e.impressa))
                    }
                    disabled={previsualizando || printing}
                    className="w-full sm:w-auto border-emerald-800/40 text-emerald-950"
                    title="Mesmo HTML enviado à Zebra — conferir antes de imprimir"
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
                    onClick={() => void imprimirPendentesNoPi()}
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
                    Zebra 60×60 (indústria)
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
        {loginIndustriaEtiquetas ? (
          <p className="text-xs text-gray-700 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <span className="font-semibold text-gray-900">Origem:</span> somente remessas da{' '}
            <strong>Indústria</strong> — esta conta não alterna para o armazém central.
          </p>
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
              disabled={carregandoOpcoesRemessa || opcoesRemessa.length === 0}
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
          </div>
        </label>
        {erroOpcoesRemessa && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{erroOpcoesRemessa}</p>
        )}
        {!carregandoOpcoesRemessa && opcoesRemessa.length === 0 && (
          <p className="text-xs text-gray-600">
            {loginIndustriaEtiquetas && !usuario?.local_padrao_id?.trim() ? (
              <>
                Para listar só remessas geradas pela <strong>indústria</strong>, defina o{' '}
                <strong>local padrão</strong> (warehouse da indústria) em{' '}
                <Link href="/cadastros/usuarios" className="text-red-600 underline">
                  Cadastros → Usuários
                </Link>{' '}
                e entre de novo.
              </>
            ) : loginIndustriaEtiquetas ? (
              <>
                Nenhuma remessa <code className="text-[10px]">SEP-…</code> da indústria <strong>criada por este login</strong>{' '}
                (origem no seu local). Remessas registradas por outro usuário ou pelo armazém central não aparecem aqui.
                Registre em{' '}
                <Link href="/separar-por-loja" className="text-red-600 underline">
                  Separar por Loja
                </Link>{' '}
                com o mesmo usuário para listar.
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

      {loteSelecionado && remessaBulkContexto && (
        <div className="mb-5 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4 shadow-sm space-y-3">
          <div className="flex flex-col gap-2">
            <p className="text-lg font-bold text-emerald-950">Remessa selecionada</p>
            {carregandoEtiquetasRemessa && (
              <p className="text-xs text-emerald-800">Carregando etiquetas desta remessa…</p>
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
                <strong>{linhasRemessaBulk.length}</strong> linha(s) em <code className="text-[10px]">etiquetas</code> para
                este lote — <strong>{pendentesRemessaBulk}</strong> ainda sem impressão,{' '}
                <strong>{linhasRemessaBulk.length - pendentesRemessaBulk}</strong> já impressas.
              </p>
              {unidadesNaTransferencia != null && unidadesNaTransferencia > linhasRemessaBulk.length && (
                <p className="text-xs text-amber-950 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2">
                  Na <strong>transferência</strong> (matriz → loja) há <strong>{unidadesNaTransferencia}</strong> unidade(s)
                  distintas; aqui só aparecem as que já têm linha em <code className="text-[10px]">etiquetas</code>. Para
                  gerar as que faltam, use <strong>Gravar etiquetas a partir da transferência</strong> abaixo (login +
                  senha operacional).
                </p>
              )}
              {parseViagemIdDeLoteSep(loteSelecionado) &&
                !carregandoEtiquetasRemessa &&
                !erroQueryEtiquetas && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2 text-xs text-amber-950">
                    {linhasRemessaBulk.length === 0 ? (
                      <p>
                        <strong>Nenhuma etiqueta ativa</strong> para este lote. Preencha <strong>login</strong> e{' '}
                        <strong>senha</strong> (os mesmos da tela de entrada) e confirme: o servidor grava em{' '}
                        <code className="text-[10px]">etiquetas</code> a partir da transferência (contorna bloqueio de
                        permissão no navegador).
                      </p>
                    ) : (
                      <p>
                        Se <strong>Separar por Loja</strong> mostra mais unidades do que esta lista, use abaixo: o
                        servidor recompõe <code className="text-[10px]">etiquetas</code> com <strong>todos</strong> os
                        itens das transferências matriz→loja desta viagem (mesmo destino), sem apagar o que já estava
                        impresso.
                      </p>
                    )}
                    {sucessoSincEtiquetasRemessa && (
                      <p className="text-emerald-900 bg-emerald-100 border border-emerald-200 rounded px-2 py-1.5">
                        {sucessoSincEtiquetasRemessa}
                      </p>
                    )}
                    {erroSincEtiquetasRemessa && (
                      <p className="text-red-800 bg-red-50 border border-red-100 rounded px-2 py-1">
                        {erroSincEtiquetasRemessa}
                      </p>
                    )}
                    <div className="space-y-2 pt-1">
                      <Input
                        label="Login operacional"
                        autoComplete="username"
                        className="text-sm py-2"
                        value={loginParaSyncRemessa}
                        onChange={(e) => setLoginParaSyncRemessa(e.target.value)}
                        placeholder="ex.: leonardo"
                        disabled={sincronizandoEtiquetasRemessa}
                      />
                      <Input
                        label="Senha"
                        type="password"
                        autoComplete="current-password"
                        className="text-sm py-2"
                        value={senhaParaSyncRemessa}
                        onChange={(e) => setSenhaParaSyncRemessa(e.target.value)}
                        placeholder="Mesma senha do login"
                        disabled={sincronizandoEtiquetasRemessa}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto inline-flex items-center justify-center border-amber-500 text-amber-950 hover:bg-amber-100 text-xs mt-1"
                        disabled={
                          sincronizandoEtiquetasRemessa ||
                          !loginParaSyncRemessa.trim() ||
                          !senhaParaSyncRemessa
                        }
                        onClick={() => void sincronizarEtiquetasDaTransferencia()}
                      >
                        {sincronizandoEtiquetasRemessa ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin shrink-0" />
                            Gravando no servidor…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                            Gravar etiquetas a partir da transferência
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              {resumoProdutosRemessa(linhasRemessaBulk, 4) && (
                <p className="text-xs text-gray-700">
                  <span className="font-medium text-emerald-900">Produtos:</span> {resumoProdutosRemessa(linhasRemessaBulk, 4)}
                </p>
              )}
              <p className="text-[11px] text-gray-500 font-mono break-all">
                Código interno (suporte): {loteSelecionado}
              </p>
              {typeof window !== 'undefined' &&
                (() => {
                  const salva = lerUltimaRemessaPersistida();
                  if (salva?.lote !== loteSelecionado) return null;
                  return (
                    <p className="text-xs text-emerald-800">
                      Última separação registrada neste aparelho para a loja: <strong>{salva.nomeLoja}</strong>
                    </p>
                  );
                })()}
            </div>
            <p className="text-xs text-emerald-900">
              Troque a remessa no campo acima. A lista por produto fica abaixo.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={
                previsualizando ||
                printing ||
                carregandoEtiquetasRemessa ||
                linhasRemessaBulk.length === 0
              }
              onClick={() => void previsualizarEtiquetas(linhasRemessaBulk)}
              title="Pré-visualizar todas as etiquetas ativas desta remessa"
            >
              {previsualizando ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              Ver prévia — remessa ({linhasRemessaBulk.length})
            </Button>
            {mostrarZebra6060 && (
              <Button
                variant="primary"
                className="border-emerald-600 bg-emerald-700 hover:bg-emerald-800"
                disabled={
                  printing || piCfgLoading || !piPrintAvailable || carregandoEtiquetasRemessa || linhasRemessaBulk.length === 0
                }
                onClick={() => void imprimirListaNoPi(linhasRemessaBulk)}
                title="Zebra 60×60 — Pi indústria"
              >
                {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
                Zebra 60×60 — remessa ({linhasRemessaBulk.length})
              </Button>
            )}
            {!somenteZebra6060Industria && (
              <Button
                variant="primary"
                className="border-emerald-600 bg-emerald-700 hover:bg-emerald-800 text-white"
                disabled={printing || carregandoEtiquetasRemessa || linhasRemessaBulk.length === 0}
                onClick={() => void imprimirRemessaInteiraNavegador(linhasRemessaBulk)}
              >
                {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                Navegador — remessa inteira ({formatoImpressao})
              </Button>
            )}
          </div>
          {mostrarZebra6060 && !piCfgLoading && !piPrintAvailable && (
            <p className="text-xs text-amber-900">
              Pi indústria indisponível: use o botão do navegador ou configure em Configurações → Impressoras.
            </p>
          )}
        </div>
      )}

      {!loteSelecionado && (
        <div className="text-center py-16 px-4 text-gray-500 border border-dashed border-gray-200 rounded-xl bg-gray-50/80">
          <QrCode className="w-14 h-14 mx-auto mb-4 opacity-40" />
          <p className="font-medium text-gray-800">Escolha uma remessa acima</p>
        </div>
      )}

      {loteSelecionado && carregandoEtiquetasRemessa && !erroQueryEtiquetas && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
          <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
          <p className="text-sm">Carregando etiquetas desta remessa…</p>
        </div>
      )}

      {loteSelecionado && !carregandoEtiquetasRemessa && !erroQueryEtiquetas && (
        <>
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
                    const tm = metaPorViagemId.get(vidGrupo);
                    if (tm) {
                      return (
                        <span className="text-xs text-gray-700">
                          <span className="font-medium text-gray-800">Remessa separação:</span>{' '}
                          {formatarDataHoraRemessaPt(tm.createdAt)} · {tm.origemNome} → {tm.destinoNome}
                          <span className="text-gray-500"> · {statusTransferenciaLegivel(tm.status)}</span>
                        </span>
                      );
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
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void previsualizarEtiquetas(grupo.etiquetas.filter((et) => !et.impressa))
                    }
                    disabled={previsualizando || printing}
                    title="Prévia só das pendentes deste produto"
                  >
                    {previsualizando ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    Prévia ({grupo.pendentes})
                  </Button>
                  {!somenteZebra6060Industria && (
                    <Button variant="primary" onClick={() => void imprimirGrupo(grupo)} disabled={printing}>
                      {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                      Navegador ({grupo.pendentes})
                    </Button>
                  )}
                  {mostrarZebra6060 && (
                    <Button
                      variant="primary"
                      onClick={() => void imprimirGrupoNoPi(grupo)}
                      disabled={printing || piCfgLoading || !piPrintAvailable}
                      className="border-emerald-600 bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
                      Zebra 60×60 ({grupo.pendentes})
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 max-h-[min(24rem,70vh)] overflow-y-auto space-y-2">
              {(gruposExpandidos.has(grupo.chave)
                ? grupo.etiquetas
                : grupo.etiquetas.slice(0, ETIQUETAS_VISIVEIS_POR_GRUPO)
              ).map((e) => (
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
                    {e.numero_sequencia_loja != null && Number.isFinite(Number(e.numero_sequencia_loja)) && (
                      <span className="text-xs font-semibold text-emerald-800">
                        Balde nº {e.numero_sequencia_loja}
                      </span>
                    )}
                    <Badge variant={e.impressa ? 'success' : 'warning'} size="sm">
                      {e.impressa ? 'Impressa' : 'Pendente'}
                    </Badge>
                  </div>
                  <div className="flex gap-1 self-end sm:self-auto">
                    <button
                      type="button"
                      aria-label="Ver prévia desta etiqueta"
                      title="Prévia numa nova aba"
                      disabled={previsualizando}
                      onClick={() => {
                        setErroImpressao('');
                        void previsualizarEtiquetas([e]);
                      }}
                      className="p-2 text-gray-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-40"
                    >
                      {previsualizando ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    {!somenteZebra6060Industria && (
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
                    )}
                    {mostrarZebra6060 && (
                      <button
                        type="button"
                        aria-label="Imprimir etiqueta na Zebra 60×60 (indústria)"
                        disabled={printing || piCfgLoading || !piPrintAvailable}
                        title={
                          !piPrintAvailable
                            ? 'Configure a ponte Pi indústria'
                            : 'Zebra 60×60 via Pi indústria'
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
                    )}
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
              {grupo.etiquetas.length > ETIQUETAS_VISIVEIS_POR_GRUPO && (
                <button
                  type="button"
                  className="w-full text-xs font-medium text-red-600 hover:text-red-700 py-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/80"
                  onClick={() =>
                    setGruposExpandidos((prev) => {
                      const n = new Set(prev);
                      if (n.has(grupo.chave)) n.delete(grupo.chave);
                      else n.add(grupo.chave);
                      return n;
                    })
                  }
                >
                  {gruposExpandidos.has(grupo.chave)
                    ? `Mostrar só as primeiras ${ETIQUETAS_VISIVEIS_POR_GRUPO} (ocultar ${grupo.etiquetas.length - ETIQUETAS_VISIVEIS_POR_GRUPO})`
                    : `Mostrar todas as ${grupo.etiquetas.length} linhas deste grupo (${ETIQUETAS_VISIVEIS_POR_GRUPO} visíveis)`}
                </button>
              )}
            </div>
          </div>
        ))}
        {filtradas.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <QrCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma etiqueta {filtro === 'pendentes' ? 'pendente' : ''} nesta remessa</p>
          </div>
        )}
          </div>
        </>
      )}
    </div>
  );
}
