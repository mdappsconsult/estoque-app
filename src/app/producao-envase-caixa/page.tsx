'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Boxes, CheckCircle, ChevronDown, ChevronUp, History, Loader2, Minus, Package, Plus, Printer, Server, Trash2, Eye } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import QRScanner from '@/components/QRScanner';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { usePiPrintBridgeConfig } from '@/hooks/usePiPrintBridgeConfig';
import { supabase } from '@/lib/supabase';
import { getItemPorCodigoEscaneado } from '@/lib/services/itens';
import { registrarEnvaseCaixasComBalde, HISTORICO_ENVASE_SELECT, mapearHistoricoEnvaseCaixaRows, type EnvaseHistoricoResumo } from '@/lib/services/producao-envase-caixa';
import { buscarEtiquetasProducaoParaReimpressao, excluirProducao } from '@/lib/services/producao';
import { mensagemBloqueioEnvase } from '@/lib/services/retorno-baldes-loja';
import type { EtiquetaGeradaProducao } from '@/lib/services/producao';
import { isAdmin } from '@/lib/auth';
import { errMessage } from '@/lib/errMessage';
import type { Local, Produto } from '@/types/database';
import {
  abrirPreviaEtiquetasEmJanela,
  confirmarImpressao,
  FORMATO_ETIQUETA_INDUSTRIA,
  type EtiquetaParaImpressao,
} from '@/lib/printing/label-print';
import { enviarEtiquetasParaPiEmMultiplosJobs } from '@/lib/printing/pi-print-ws-client';
import {
  ENVASE_MEDIA_BALDES_REF,
  ENVASE_MEDIA_CAIXAS_REF,
  calcularCaixasEsperadasEnvase,
  textoMediaEnvase,
} from '@/lib/producao-envase-ratio';

type BaldeEscaneado = { id: string; token_qr: string; token_short: string | null; nomeProduto: string };

/** Padrões operacionais indústria (envase caixas). */
const ENVASE_DIAS_VALIDADE_PADRAO = 120;

function acharProdutoBaldePadrao(produtos: Produto[]): string {
  const balde11 = produtos.find(
    (p) => /11\s*l/i.test(p.nome) && /balde/i.test(p.nome) && /açaí|acai/i.test(p.nome)
  );
  if (balde11?.id) return balde11.id;
  const baldeAcai = produtos.find((p) => /açaí.*balde|acai.*balde|balde.*açaí|balde.*acai/i.test(p.nome));
  return baldeAcai?.id ?? '';
}

function acharProdutoCaixaPadrao(produtos: Produto[]): string {
  const caixa10 = produtos.find(
    (p) => /10\s*l/i.test(p.nome) && /caixa/i.test(p.nome) && /açaí|acai/i.test(p.nome)
  );
  if (caixa10?.id) return caixa10.id;
  const envase = produtos.find((p) => /envase/i.test(p.nome) && /caixa.*açaí|caixa.*acai/i.test(p.nome));
  if (envase?.id) return envase.id;
  const generico = produtos.find((p) => /caixa.*açaí|caixa.*acai|açaí.*caixa|acai.*caixa/i.test(p.nome));
  return generico?.id ?? '';
}

export default function ProducaoEnvaseCaixaPage() {
  const { usuario } = useAuth();
  const { data: produtos, loading: loadingProdutos } = useRealtimeQuery<Produto>({
    table: 'produtos',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });

  const {
    loading: piCfgLoading,
    available: piPrintAvailable,
    connection: piConnection,
  } = usePiPrintBridgeConfig({ papel: 'industria' });

  const produtosAcabado = useMemo(
    () => produtos.filter((p) => !p.origem || p.origem === 'PRODUCAO' || p.origem === 'AMBOS'),
    [produtos]
  );

  const warehouses = useMemo(() => locais.filter((l) => l.tipo === 'WAREHOUSE'), [locais]);
  const defaultWarehouseId = useMemo(() => {
    if (warehouses.length === 0) return '';
    const byUser = usuario?.local_padrao_id?.trim();
    if (byUser && warehouses.some((w) => w.id === byUser)) return byUser;
    const industria = warehouses.find((w) => /ind[uú]stria/i.test(w.nome));
    return industria?.id ?? warehouses[0]!.id;
  }, [warehouses, usuario?.local_padrao_id]);

  const [produtoCaixaId, setProdutoCaixaId] = useState('');
  const [produtoBaldeId, setProdutoBaldeId] = useState('');
  const [diasValidadeStr, setDiasValidadeStr] = useState(String(ENVASE_DIAS_VALIDADE_PADRAO));
  const [localId, setLocalId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [baldesEscaneados, setBaldesEscaneados] = useState<BaldeEscaneado[]>([]);
  const [numCaixasStr, setNumCaixasStr] = useState('');
  const [caixasEditadasManual, setCaixasEditadasManual] = useState(false);
  const [tokenManual, setTokenManual] = useState('');
  const [mostrarManual, setMostrarManual] = useState(false);
  const [buscandoQr, setBuscandoQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  /** Câmera dispara o mesmo QR várias vezes — refs síncronos evitam duplicata na lista. */
  const processandoRef = useRef(false);
  const ultimoScanRef = useRef<{ token: string; ts: number } | null>(null);
  const baldesIdsRef = useRef<Set<string>>(new Set());

  const [etiquetasPendentes, setEtiquetasPendentes] = useState<EtiquetaGeradaProducao[]>([]);
  const [nomeCaixaImpressao, setNomeCaixaImpressao] = useState('Caixa');
  const [nomeLocalImpressao, setNomeLocalImpressao] = useState('Indústria');
  const [ultimoResumo, setUltimoResumo] = useState<{
    producaoId: string;
    numeroLote: number;
    numCaixas: number;
    numBaldes: number;
    caixasEsperadas: number;
  } | null>(null);

  const [imprimindoPi, setImprimindoPi] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [ajustesAbertos, setAjustesAbertos] = useState(false);
  const [reimpressaoProducaoId, setReimpressaoProducaoId] = useState<string | null>(null);
  const [excluindoProducaoId, setExcluindoProducaoId] = useState<string | null>(null);
  /** Oculta linha na hora após exclusão (antes do refetch do histórico). */
  const [historicoIdsOcultos, setHistoricoIdsOcultos] = useState<Set<string>>(() => new Set());
  const [producaoIdEtiquetasCarregadas, setProducaoIdEtiquetasCarregadas] = useState<string | null>(null);
  const podeExcluirEnvase = isAdmin(usuario);
  const painelImpressaoRef = useRef<HTMLDivElement>(null);

  const filtroHistoricoEnvase = useMemo(() => {
    const base = [{ column: 'tipo' as const, value: 'ENVASE_CAIXA' }];
    const perfil = usuario?.perfil;
    if (perfil === 'OPERATOR_WAREHOUSE' || perfil === 'OPERATOR_WAREHOUSE_DRIVER') {
      const lid = usuario?.local_padrao_id?.trim();
      if (lid) return [...base, { column: 'local_id' as const, value: lid }];
    }
    return base;
  }, [usuario]);

  const {
    data: historicoEnvase,
    loading: historicoLoading,
    error: historicoError,
    refetch: refetchHistoricoEnvase,
  } = useRealtimeQuery<EnvaseHistoricoResumo>({
    table: 'producoes',
    select: HISTORICO_ENVASE_SELECT,
    filters: filtroHistoricoEnvase,
    orderBy: { column: 'created_at', ascending: false },
    maxRows: 80,
    enabled: Boolean(usuario),
    transform: mapearHistoricoEnvaseCaixaRows,
    preserveDataWhileRefetching: true,
    refetchDebounceMs: 400,
  });

  const historicoEnvaseVisivel = useMemo(
    () => historicoEnvase.filter((row) => !historicoIdsOcultos.has(row.id)),
    [historicoEnvase, historicoIdsOcultos]
  );

  useEffect(() => {
    if (!defaultWarehouseId) return;
    setLocalId((prev) => (prev ? prev : defaultWarehouseId));
  }, [defaultWarehouseId]);

  useEffect(() => {
    if (produtosAcabado.length === 0) return;
    setProdutoBaldeId((prev) => prev || acharProdutoBaldePadrao(produtosAcabado));
    setProdutoCaixaId((prev) => prev || acharProdutoCaixaPadrao(produtosAcabado));
  }, [produtosAcabado]);

  const diasValidade = Math.floor(Number(diasValidadeStr) || 0);
  const numBaldes = baldesEscaneados.length;
  const caixasEsperadas = calcularCaixasEsperadasEnvase(numBaldes);
  const numCaixasInformadas = Math.floor(Number(numCaixasStr) || 0);
  const bateMedia = numBaldes > 0 && numCaixasInformadas === caixasEsperadas;

  useEffect(() => {
    if (numBaldes <= 0) {
      setNumCaixasStr('');
      setCaixasEditadasManual(false);
      return;
    }
    if (!caixasEditadasManual) {
      setNumCaixasStr(String(caixasEsperadas));
    }
  }, [numBaldes, caixasEsperadas, caixasEditadasManual]);

  const nomeCaixa = produtosAcabado.find((p) => p.id === produtoCaixaId)?.nome ?? '—';
  const nomeBalde = produtosAcabado.find((p) => p.id === produtoBaldeId)?.nome ?? '—';

  const formularioOk =
    Boolean(produtoCaixaId) &&
    Boolean(produtoBaldeId) &&
    produtoCaixaId !== produtoBaldeId &&
    Boolean(localId) &&
    diasValidade >= 1 &&
    numBaldes >= 1 &&
    numCaixasInformadas >= 1;

  const ajustarCaixas = (delta: number) => {
    const base = numCaixasInformadas >= 1 ? numCaixasInformadas : caixasEsperadas || 1;
    const next = Math.max(1, base + delta);
    setNumCaixasStr(String(next));
    setCaixasEditadasManual(true);
  };

  const montarPayloadImpressao = (): EtiquetaParaImpressao[] => {
    const agora = new Date().toISOString();
    const nomeLocal = nomeLocalImpressao.trim() || 'Indústria';
    return etiquetasPendentes.map((etiqueta) => ({
      id: etiqueta.id,
      produtoNome: nomeCaixaImpressao,
      dataManipulacao: etiqueta.dataProducao,
      dataValidade: etiqueta.dataValidade,
      lote: etiqueta.lote,
      tokenQr: etiqueta.tokenQr,
      tokenShort: etiqueta.tokenShort || etiqueta.id.slice(0, 8).toUpperCase(),
      responsavel: usuario?.nome || 'OPERADOR',
      nomeLoja: nomeLocal,
      dataGeracaoIso: agora,
      loteProducaoNumero: etiqueta.numeroLoteProducao,
      sequenciaNoLote: etiqueta.sequenciaNoLote,
      numBaldesLoteProducao: etiqueta.numBaldesLote,
      dataLoteProducaoIso: etiqueta.dataLoteProducaoIso,
    }));
  };

  const processarCodigo = async (raw: string) => {
    const t = raw.trim();
    if (!t) return;

    const agora = Date.now();
    const ultimo = ultimoScanRef.current;
    if (ultimo && ultimo.token === t && agora - ultimo.ts < 1500) {
      return;
    }
    ultimoScanRef.current = { token: t, ts: agora };

    if (processandoRef.current) return;
    processandoRef.current = true;

    if (!produtoBaldeId) {
      setErro('Produto balde não configurado. Abra «Ajustes» ou peça ao supervisor.');
      processandoRef.current = false;
      return;
    }
    if (!localId) {
      setErro('Local da indústria não definido.');
      processandoRef.current = false;
      return;
    }
    setErro('');
    setBuscandoQr(true);
    try {
      const item = await getItemPorCodigoEscaneado(t);
      if (!item) {
        setErro('QR não encontrado. Leia de novo ou confira a etiqueta.');
        return;
      }
      if (baldesIdsRef.current.has(item.id)) {
        setErro('Este balde já foi lido.');
        return;
      }
      if (item.produto_id !== produtoBaldeId) {
        setErro(`Este QR não é balde «${nomeBalde}».`);
        return;
      }
      if (item.estado !== 'EM_ESTOQUE') {
        setErro('Este balde não está disponível no estoque.');
        return;
      }
      if (item.local_atual_id !== localId) {
        setErro('Este balde não está na indústria agora.');
        return;
      }
      const msgBloqueio = mensagemBloqueioEnvase(item.retorno_balde_status);
      if (msgBloqueio) {
        setErro(msgBloqueio);
        return;
      }

      baldesIdsRef.current.add(item.id);
      setBaldesEscaneados((prev) => {
        if (prev.some((b) => b.id === item.id)) return prev;
        return [
          ...prev,
          {
            id: item.id,
            token_qr: item.token_qr,
            token_short: item.token_short,
            nomeProduto: item.produto?.nome ?? nomeBalde,
          },
        ];
      });
      setTokenManual('');
      setErro('');
    } catch (e: unknown) {
      setErro(errMessage(e, 'Falha ao buscar o item.'));
    } finally {
      setBuscandoQr(false);
      processandoRef.current = false;
    }
  };

  const removerBalde = (itemId: string) => {
    baldesIdsRef.current.delete(itemId);
    setBaldesEscaneados((prev) => prev.filter((x) => x.id !== itemId));
  };

  const registrar = async () => {
    if (!formularioOk || !usuario?.id) return;
    const msg = bateMedia
      ? `Confirmar?\n\n${numBaldes} balde(s) → ${numCaixasInformadas} caixa(s)\n(Igual à média de hoje)`
      : `Confirmar?\n\n${numBaldes} balde(s) → ${numCaixasInformadas} caixa(s)\nMédia seria ${caixasEsperadas} caixa(s)`;
    if (!window.confirm(msg)) return;
    setSaving(true);
    setErro('');
    try {
      const res = await registrarEnvaseCaixasComBalde({
        usuarioId: usuario.id,
        responsavelNome: usuario.nome?.trim() || 'OPERADOR',
        localId,
        produtoCaixaId,
        produtoBaldeId,
        numCaixas: numCaixasInformadas,
        baldesReferencia: ENVASE_MEDIA_BALDES_REF,
        caixasReferencia: ENVASE_MEDIA_CAIXAS_REF,
        diasValidade,
        observacoes: observacoes.trim() || null,
        itemIdsBalde: baldesEscaneados.map((b) => b.id),
      });
      setUltimoResumo({
        producaoId: res.producaoId,
        numeroLote: res.numeroLoteProducao,
        numCaixas: res.numCaixas,
        numBaldes: res.numBaldesConsumidos,
        caixasEsperadas: res.caixasEsperadas,
      });
      setNomeCaixaImpressao(nomeCaixa);
      setNomeLocalImpressao(warehouses.find((w) => w.id === localId)?.nome ?? 'Indústria');
      setEtiquetasPendentes(res.etiquetas);
      setProducaoIdEtiquetasCarregadas(res.producaoId);
      baldesIdsRef.current = new Set();
      setBaldesEscaneados([]);
      setNumCaixasStr('');
      setCaixasEditadasManual(false);
      setObservacoes('');
      window.setTimeout(() => painelImpressaoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (e: unknown) {
      setErro(errMessage(e, 'Erro ao registrar envase.'));
    } finally {
      setSaving(false);
    }
  };

  const imprimirPi = async () => {
    if (etiquetasPendentes.length === 0) return;
    if (!piPrintAvailable || !piConnection) {
      alert('Zebra indisponível. Configure em Configurações → Impressoras ou use o histórico abaixo para tentar de novo.');
      return;
    }
    if (!confirmarImpressao(etiquetasPendentes.length, FORMATO_ETIQUETA_INDUSTRIA)) return;
    setImprimindoPi(true);
    try {
      await enviarEtiquetasParaPiEmMultiplosJobs(montarPayloadImpressao(), FORMATO_ETIQUETA_INDUSTRIA, {
        jobNameBase: `envase-caixa-${etiquetasPendentes[0]?.lote || 'lote'}`.slice(0, 72),
        connection: piConnection,
        papel: 'industria',
      });
      const ids = etiquetasPendentes.map((e) => e.id);
      const { error } = await supabase.from('etiquetas').update({ impressa: true }).in('id', ids);
      if (error) throw error;
      setEtiquetasPendentes([]);
      alert('Etiquetas enviadas para a Zebra (60×60).');
      setProducaoIdEtiquetasCarregadas(null);
    } catch (e: unknown) {
      alert(
        `${errMessage(e, 'Falha ao imprimir na Zebra.')}\n\nAs etiquetas continuam salvas — use «Envases registrados» abaixo → Reimprimir.`
      );
    } finally {
      setImprimindoPi(false);
    }
  };

  const carregarEtiquetasHistorico = async (row: EnvaseHistoricoResumo) => {
    setReimpressaoProducaoId(row.id);
    try {
      const list = await buscarEtiquetasProducaoParaReimpressao(row.id);
      setNomeCaixaImpressao(row.produtoCaixaNome);
      setNomeLocalImpressao(row.localNome);
      setEtiquetasPendentes(
        list.map((e) => ({
          id: e.id,
          produtoId: produtoCaixaId,
          dataProducao: e.dataProducao,
          dataValidade: e.dataValidade,
          lote: e.lote,
          tokenQr: e.tokenQr,
          tokenShort: e.tokenShort,
          numeroLoteProducao: e.numeroLoteProducao,
          sequenciaNoLote: e.sequenciaNoLote,
          numBaldesLote: e.numBaldesLote,
          dataLoteProducaoIso: e.dataLoteProducaoIso,
        }))
      );
      setProducaoIdEtiquetasCarregadas(row.id);
      window.setTimeout(() => painelImpressaoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (e: unknown) {
      alert(errMessage(e, 'Não foi possível carregar as etiquetas deste envase.'));
    } finally {
      setReimpressaoProducaoId(null);
    }
  };

  const handleExcluirEnvase = async (row: EnvaseHistoricoResumo) => {
    if (!usuario?.id || !podeExcluirEnvase) return;
    const ok = window.confirm(
      `Excluir este envase?\n\n` +
        `Lote ${row.numeroLoteProducao ?? '—'} · ${row.numBaldesConsumidos} balde(s) → ${row.numCaixas} caixa(s)\n\n` +
        `Só funciona se todas as caixas ainda estiverem na indústria e os baldes puderem voltar ao estoque.`
    );
    if (!ok) return;
    setExcluindoProducaoId(row.id);
    try {
      const r = await excluirProducao(row.id, usuario.id);
      setHistoricoIdsOcultos((prev) => new Set(prev).add(row.id));
      if (ultimoResumo?.producaoId === row.id) setUltimoResumo(null);
      if (producaoIdEtiquetasCarregadas === row.id) {
        setEtiquetasPendentes([]);
        setProducaoIdEtiquetasCarregadas(null);
      }
      await refetchHistoricoEnvase();
      setHistoricoIdsOcultos((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      alert(
        `Envase excluído.\n` +
          `${r.qrsAcabadoRevertidos} caixa(s) removidas.\n` +
          (r.insumosQrRevertidos > 0 ? `${r.insumosQrRevertidos} balde(s) devolvido(s) ao estoque.` : '')
      );
    } catch (e: unknown) {
      alert(errMessage(e, 'Não foi possível excluir este envase.'));
    } finally {
      setExcluindoProducaoId(null);
    }
  };

  const previa = async () => {
    if (etiquetasPendentes.length === 0) return;
    setPrevisualizando(true);
    try {
      const ok = await abrirPreviaEtiquetasEmJanela(montarPayloadImpressao(), FORMATO_ETIQUETA_INDUSTRIA, {
        mensagemBarra: 'Prévia das caixas (60×60).',
        voltarPath: '/producao-envase-caixa',
      });
      if (!ok) throw new Error('Libere pop-ups para ver a prévia.');
    } catch (e: unknown) {
      alert(errMessage(e, 'Falha na prévia'));
    } finally {
      setPrevisualizando(false);
    }
  };

  if (loadingProdutos) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-1 sm:px-0 space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
          <Boxes className="w-5 h-5 text-emerald-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fazer caixas</h1>
          <p className="text-sm text-gray-600">Leia os baldes → diga quantas caixas saíram → imprima as etiquetas.</p>
        </div>
      </div>

      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-center">
        <p className="text-xs uppercase tracking-wide text-emerald-800 font-semibold">Média de hoje</p>
        <p className="text-2xl font-bold text-emerald-950 mt-0.5">{textoMediaEnvase()}</p>
      </div>

      {ultimoResumo && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle className="w-5 h-5 shrink-0" />
            Último envase registrado
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-green-950/90">
            <li>
              Lote nº <span className="font-medium">{ultimoResumo.numeroLote}</span>
            </li>
            <li>
              <span className="font-medium">{ultimoResumo.numBaldes}</span> balde(s) →{' '}
              <span className="font-medium">{ultimoResumo.numCaixas}</span> caixa(s)
              {ultimoResumo.numCaixas === ultimoResumo.caixasEsperadas ? (
                <span className="text-green-700"> (bateu a média)</span>
              ) : (
                <span className="text-amber-800">
                  {' '}
                  (média era {ultimoResumo.caixasEsperadas})
                </span>
              )}
            </li>
          </ul>
        </div>
      )}

      {etiquetasPendentes.length > 0 && (
        <div ref={painelImpressaoRef} className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4 space-y-3">
          <p className="text-sm text-blue-900">
            <strong>{etiquetasPendentes.length}</strong> etiqueta(s) de caixa (60×60). Na indústria use a{' '}
            <strong>Zebra</strong>.
          </p>
          <p className="text-xs text-blue-800/90">
            Se a impressão falhar, as etiquetas ficam salvas — role até «Envases registrados» e toque em{' '}
            <strong>Reimprimir</strong>.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              className="min-h-[48px] flex-1 bg-emerald-700 hover:bg-emerald-800"
              onClick={() => void imprimirPi()}
              disabled={imprimindoPi || piCfgLoading || !piPrintAvailable}
            >
              {imprimindoPi ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Server className="w-4 h-4 mr-2" />}
              Imprimir na Zebra (60×60)
            </Button>
            <Button type="button" variant="outline" onClick={() => void previa()} disabled={previsualizando}>
              {previsualizando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              Ver prévia
            </Button>
          </div>
          {!piPrintAvailable && !piCfgLoading && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Zebra/Pi não configurada. Ajuste em Configurações → Impressoras — ou reimprima depois pelo histórico.
            </p>
          )}
        </div>
      )}

      {/* Passo 1 — bipar baldes */}
      <div className="bg-white rounded-xl border-2 border-emerald-200 p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-lg font-bold text-gray-900">1. Ler baldes</p>
          <span className="text-3xl font-bold tabular-nums text-emerald-700">{numBaldes}</span>
        </div>

        <QRScanner onScan={(code) => void processarCodigo(code)} label="Ligar câmera e ler QR do balde" />

        {!mostrarManual ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => setMostrarManual(true)}>
            Digitar código
          </Button>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Código do balde"
              value={tokenManual}
              onChange={(e) => setTokenManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void processarCodigo(tokenManual)}
            />
            <Button type="button" variant="primary" onClick={() => void processarCodigo(tokenManual)} disabled={buscandoQr}>
              {buscandoQr ? <Loader2 className="w-4 h-4 animate-spin" /> : 'OK'}
            </Button>
          </div>
        )}

        {baldesEscaneados.length > 0 && (
          <ul className="max-h-40 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {baldesEscaneados.map((b, i) => (
              <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="text-gray-500 tabular-nums w-6">{i + 1}.</span>
                <span className="font-mono flex-1 truncate">{b.token_short || b.token_qr}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0 p-1 h-9 w-9"
                  aria-label="Remover"
                  onClick={() => removerBalde(b.id)}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Passo 2 — quantas caixas */}
      <div
        className={`bg-white rounded-xl border-2 p-5 space-y-4 ${numBaldes >= 1 ? 'border-emerald-200' : 'border-gray-200 opacity-60'}`}
      >
        <p className="text-lg font-bold text-gray-900">2. Quantas caixas saíram?</p>

        {numBaldes >= 1 ? (
          <>
            <p className="text-sm text-gray-600">
              Com <strong>{numBaldes}</strong> balde(s), a média de hoje dá{' '}
              <strong className="text-emerald-800">{caixasEsperadas}</strong> caixa(s). Confira na mesa e ajuste se
              precisar.
            </p>

            <div className="flex items-center justify-center gap-4 py-2">
              <Button
                type="button"
                variant="outline"
                className="h-14 w-14 rounded-full p-0"
                aria-label="Menos uma caixa"
                onClick={() => ajustarCaixas(-1)}
                disabled={numCaixasInformadas <= 1 && caixasEsperadas <= 1}
              >
                <Minus className="w-6 h-6" />
              </Button>
              <div className="text-center min-w-[5rem]">
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  className="w-full text-center text-4xl font-bold tabular-nums text-gray-900 border-0 bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-400 rounded-lg"
                  value={numCaixasStr}
                  onChange={(e) => {
                    setNumCaixasStr(e.target.value);
                    setCaixasEditadasManual(true);
                  }}
                  aria-label="Quantidade de caixas"
                />
                <p className="text-xs text-gray-500 mt-1">caixas</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-14 w-14 rounded-full p-0"
                aria-label="Mais uma caixa"
                onClick={() => ajustarCaixas(1)}
              >
                <Plus className="w-6 h-6" />
              </Button>
            </div>

            {bateMedia ? (
              <p className="text-sm text-center text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 font-medium">
                Bateu a média ({textoMediaEnvase()})
              </p>
            ) : numCaixasInformadas >= 1 ? (
              <p className="text-sm text-center text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Diferente da média — esperado <strong>{caixasEsperadas}</strong>, informado{' '}
                <strong>{numCaixasInformadas}</strong>. Tudo bem se a mesa conferir.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-gray-500">Leia pelo menos 1 balde no passo 1.</p>
        )}
      </div>

      {erro && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
          {erro}
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        className="w-full min-h-[56px] text-lg bg-emerald-600 hover:bg-emerald-700"
        disabled={!formularioOk || saving || !usuario?.id}
        onClick={() => void registrar()}
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Package className="w-5 h-5 mr-2" />}
        3. Registrar e gerar etiquetas das caixas
      </Button>

      <details open className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
        <summary className="flex items-center justify-between gap-2 px-5 py-3 cursor-pointer list-none bg-slate-50 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <History className="w-4 h-4 text-gray-500" />
            Envases registrados
          </span>
          <ChevronDown className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-600">
            Impressão falhou ou fechou a página? Toque em <strong>Reimprimir</strong> na linha do lote.
            {podeExcluirEnvase ? (
              <>
                {' '}
                Como administrador, você pode <strong>Excluir</strong> um envase errado (caixas ainda na
                indústria).
              </>
            ) : (
              <> Para excluir um lançamento errado, peça ao administrador.</>
            )}
          </p>
          {historicoLoading && historicoEnvaseVisivel.length === 0 ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : historicoError ? (
            <p className="text-sm text-red-700">{errMessage(historicoError, 'Erro ao carregar histórico.')}</p>
          ) : historicoEnvaseVisivel.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Nenhum envase registrado ainda.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-2 font-medium whitespace-nowrap">Quando</th>
                    <th className="py-2 pr-2 font-medium">Caixa</th>
                    <th className="py-2 pr-2 font-medium text-right whitespace-nowrap">Baldes</th>
                    <th className="py-2 pr-2 font-medium text-right whitespace-nowrap">Caixas</th>
                    <th className="py-2 pr-2 font-medium text-right whitespace-nowrap">Lote</th>
                    <th className="py-2 pr-2 font-medium whitespace-nowrap">Reimprimir</th>
                    {podeExcluirEnvase && <th className="py-2 font-medium whitespace-nowrap">Excluir (admin)</th>}
                  </tr>
                </thead>
                <tbody>
                  {historicoEnvaseVisivel.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                      <td className="py-2 pr-2 whitespace-nowrap text-gray-800">
                        {row.createdAt
                          ? new Date(row.createdAt).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                      <td className="py-2 pr-2 max-w-[100px] truncate text-gray-800" title={row.produtoCaixaNome}>
                        {row.produtoCaixaNome}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{row.numBaldesConsumidos}</td>
                      <td className="py-2 pr-2 text-right tabular-nums font-medium">
                        {row.contagemDisponivel ? row.qrsCaixa : row.numCaixas}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.numeroLoteProducao ?? '—'}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        <Button
                          type="button"
                          variant="outline"
                          className="text-[11px] px-2 py-1 min-h-0 h-auto"
                          disabled={reimpressaoProducaoId === row.id}
                          onClick={() => void carregarEtiquetasHistorico(row)}
                        >
                          {reimpressaoProducaoId === row.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Printer className="w-3.5 h-3.5 mr-1 inline" />
                              Reimprimir
                            </>
                          )}
                        </Button>
                      </td>
                      {podeExcluirEnvase && (
                        <td className="py-2 whitespace-nowrap">
                          <Button
                            type="button"
                            variant="outline"
                            className="text-[11px] px-2 py-1 min-h-0 h-auto text-red-700 border-red-300 hover:bg-red-50"
                            disabled={excluindoProducaoId === row.id}
                            onClick={() => void handleExcluirEnvase(row)}
                          >
                            {excluindoProducaoId === row.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="w-3.5 h-3.5 mr-1 inline" />
                                Excluir
                              </>
                            )}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left bg-slate-50 border-b border-gray-100"
          onClick={() => setAjustesAbertos((v) => !v)}
        >
          <span className="text-sm font-semibold text-gray-900">
            Ajustes (supervisor)
            {!ajustesAbertos && produtoCaixaId && produtoBaldeId && (
              <span className="font-normal text-gray-500 ml-2">
                — {nomeBalde} → {nomeCaixa}
              </span>
            )}
          </span>
          {ajustesAbertos ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        {ajustesAbertos && (
          <div className="p-5 space-y-4">
            <Select
              label="Produto caixa"
              required
              value={produtoCaixaId}
              onChange={(e) => setProdutoCaixaId(e.target.value)}
              options={[
                { value: '', label: 'Selecione…' },
                ...produtosAcabado.map((p) => ({ value: p.id, label: p.nome })),
              ]}
            />
            <Select
              label="Produto balde"
              required
              value={produtoBaldeId}
              onChange={(e) => setProdutoBaldeId(e.target.value)}
              options={[
                { value: '', label: 'Selecione…' },
                ...produtosAcabado.map((p) => ({ value: p.id, label: p.nome })),
              ]}
            />
            <Input
              label="Validade da caixa (dias)"
              type="number"
              min={1}
              step={1}
              value={diasValidadeStr}
              onChange={(e) => setDiasValidadeStr(e.target.value)}
              required
            />
            <Select
              label="Local (indústria)"
              required
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              disabled={Boolean(defaultWarehouseId)}
              options={[{ value: '', label: 'Selecione…' }, ...warehouses.map((w) => ({ value: w.id, label: w.nome }))]}
            />
            <Input label="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            <p className="text-xs text-gray-500">
              Retorno de loja:{' '}
              <Link href="/coleta-baldes-loja" className="underline">
                Coleta
              </Link>
              {' → '}
              <Link href="/retorno-baldes-industria" className="underline">
                Triagem
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
