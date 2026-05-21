'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Boxes, CheckCircle, ChevronDown, ChevronUp, Loader2, Package, Printer, Server, Trash2, Eye } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import QRScanner from '@/components/QRScanner';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { usePiPrintBridgeConfig } from '@/hooks/usePiPrintBridgeConfig';
import { supabase } from '@/lib/supabase';
import { getItemPorCodigoEscaneado } from '@/lib/services/itens';
import { registrarEnvaseCaixasComBalde } from '@/lib/services/producao-envase-caixa';
import { mensagemBloqueioEnvase } from '@/lib/services/retorno-baldes-loja';
import type { EtiquetaGeradaProducao } from '@/lib/services/producao';
import { errMessage } from '@/lib/errMessage';
import type { Local, Produto } from '@/types/database';
import {
  abrirPreviaEtiquetasEmJanela,
  confirmarImpressao,
  FORMATO_ETIQUETA_INDUSTRIA,
  imprimirEtiquetasEmJobUnico,
  type EtiquetaParaImpressao,
} from '@/lib/printing/label-print';
import { enviarEtiquetasParaPiEmMultiplosJobs } from '@/lib/printing/pi-print-ws-client';

type BaldeEscaneado = { id: string; token_qr: string; token_short: string | null; nomeProduto: string };

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
  const [baldesPorCaixaStr, setBaldesPorCaixaStr] = useState('2');
  const [diasValidadeStr, setDiasValidadeStr] = useState('7');
  const [localId, setLocalId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [baldesEscaneados, setBaldesEscaneados] = useState<BaldeEscaneado[]>([]);
  const [tokenManual, setTokenManual] = useState('');
  const [mostrarManual, setMostrarManual] = useState(false);
  const [buscandoQr, setBuscandoQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const [etiquetasPendentes, setEtiquetasPendentes] = useState<EtiquetaGeradaProducao[]>([]);
  const [nomeCaixaImpressao, setNomeCaixaImpressao] = useState('Caixa');
  const [nomeLocalImpressao, setNomeLocalImpressao] = useState('Indústria');
  const [ultimoResumo, setUltimoResumo] = useState<{
    producaoId: string;
    numeroLote: number;
    numCaixas: number;
    numBaldes: number;
    baldesPorCaixa: number;
  } | null>(null);

  const [imprimindo, setImprimindo] = useState(false);
  const [imprimindoPi, setImprimindoPi] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [configAberta, setConfigAberta] = useState(true);
  const painelImpressaoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!defaultWarehouseId) return;
    setLocalId((prev) => (prev ? prev : defaultWarehouseId));
  }, [defaultWarehouseId]);

  const baldesPorCaixa = Math.floor(Number(baldesPorCaixaStr) || 0);
  const diasValidade = Math.floor(Number(diasValidadeStr) || 0);
  const numCaixasPrevistas =
    baldesPorCaixa >= 1 && baldesEscaneados.length > 0 && baldesEscaneados.length % baldesPorCaixa === 0
      ? baldesEscaneados.length / baldesPorCaixa
      : null;

  const nomeCaixa = produtosAcabado.find((p) => p.id === produtoCaixaId)?.nome ?? '—';
  const nomeBalde = produtosAcabado.find((p) => p.id === produtoBaldeId)?.nome ?? '—';

  const formularioOk =
    Boolean(produtoCaixaId) &&
    Boolean(produtoBaldeId) &&
    produtoCaixaId !== produtoBaldeId &&
    Boolean(localId) &&
    baldesPorCaixa >= 1 &&
    diasValidade >= 1 &&
    baldesEscaneados.length > 0 &&
    baldesEscaneados.length % baldesPorCaixa === 0;

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
    if (!produtoBaldeId) {
      setErro('Selecione o produto balde antes de escanear.');
      return;
    }
    if (!localId) {
      setErro('Selecione o local (indústria).');
      return;
    }
    setErro('');
    setBuscandoQr(true);
    try {
      const item = await getItemPorCodigoEscaneado(t);
      if (!item) {
        setErro('QR não encontrado. Confira o código ou a rede.');
        return;
      }
      if (item.produto_id !== produtoBaldeId) {
        setErro(`Este QR é de «${item.produto?.nome ?? '?'}», não do balde selecionado («${nomeBalde}»).`);
        return;
      }
      if (item.estado !== 'EM_ESTOQUE') {
        setErro(`Este balde não está em estoque (${item.estado}).`);
        return;
      }
      if (item.local_atual_id !== localId) {
        setErro('Este balde não está no local selecionado.');
        return;
      }
      const msgBloqueio = mensagemBloqueioEnvase(item.retorno_balde_status);
      if (msgBloqueio) {
        setErro(msgBloqueio);
        return;
      }
      if (baldesEscaneados.some((b) => b.id === item.id)) {
        setErro('Este balde já está na lista.');
        return;
      }
      setBaldesEscaneados((prev) => [
        ...prev,
        {
          id: item.id,
          token_qr: item.token_qr,
          token_short: item.token_short,
          nomeProduto: item.produto?.nome ?? nomeBalde,
        },
      ]);
      setTokenManual('');
    } catch (e: unknown) {
      setErro(errMessage(e, 'Falha ao buscar o item.'));
    } finally {
      setBuscandoQr(false);
    }
  };

  const registrar = async () => {
    if (!formularioOk || !usuario?.id) return;
    if (!window.confirm('Confirmar envase? Os baldes listados serão baixados e as caixas entrarão em estoque.')) return;
    setSaving(true);
    setErro('');
    try {
      const res = await registrarEnvaseCaixasComBalde({
        usuarioId: usuario.id,
        responsavelNome: usuario.nome?.trim() || 'OPERADOR',
        localId,
        produtoCaixaId,
        produtoBaldeId,
        baldesPorCaixa,
        diasValidade,
        observacoes: observacoes.trim() || null,
        itemIdsBalde: baldesEscaneados.map((b) => b.id),
      });
      setUltimoResumo({
        producaoId: res.producaoId,
        numeroLote: res.numeroLoteProducao,
        numCaixas: res.numCaixas,
        numBaldes: res.numBaldesConsumidos,
        baldesPorCaixa: res.baldesPorCaixa,
      });
      setNomeCaixaImpressao(nomeCaixa);
      setNomeLocalImpressao(warehouses.find((w) => w.id === localId)?.nome ?? 'Indústria');
      setEtiquetasPendentes(res.etiquetas);
      setBaldesEscaneados([]);
      setObservacoes('');
      window.setTimeout(() => painelImpressaoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (e: unknown) {
      setErro(errMessage(e, 'Erro ao registrar envase.'));
    } finally {
      setSaving(false);
    }
  };

  const imprimirNavegador = async () => {
    if (etiquetasPendentes.length === 0) return;
    if (!confirmarImpressao(etiquetasPendentes.length, FORMATO_ETIQUETA_INDUSTRIA)) return;
    setImprimindo(true);
    try {
      const ok = await imprimirEtiquetasEmJobUnico(montarPayloadImpressao(), FORMATO_ETIQUETA_INDUSTRIA);
      if (!ok) throw new Error('Não foi possível abrir a impressão. Libere pop-ups.');
      const ids = etiquetasPendentes.map((e) => e.id);
      const { error } = await supabase.from('etiquetas').update({ impressa: true }).in('id', ids);
      if (error) throw error;
      setEtiquetasPendentes([]);
      alert('Etiquetas enviadas para impressão.');
    } catch (e: unknown) {
      alert(errMessage(e, 'Falha ao imprimir'));
    } finally {
      setImprimindo(false);
    }
  };

  const imprimirPi = async () => {
    if (etiquetasPendentes.length === 0) return;
    if (!piPrintAvailable || !piConnection) {
      alert('Configure a ponte indústria em Configurações → Impressoras.');
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
      alert('Etiquetas enviadas para a Zebra (Pi / indústria).');
    } catch (e: unknown) {
      alert(errMessage(e, 'Falha ao imprimir na Pi'));
    } finally {
      setImprimindoPi(false);
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
    <div className="max-w-3xl mx-auto px-1 sm:px-0 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
          <Boxes className="w-5 h-5 text-emerald-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Envase — caixas (saída)</h1>
          <p className="text-sm text-gray-600">
            Dia de produção: bipe baldes já triados na indústria; gera caixas com QR novos.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span>
          Fluxo retorno:{' '}
          <Link href="/coleta-baldes-loja" className="font-semibold underline">
            Coleta na loja
          </Link>
          {' → '}
          <Link href="/retorno-baldes-industria" className="font-semibold underline">
            Triagem
          </Link>
          {' → envase (esta tela).'}
        </span>
      </div>

      {ultimoResumo && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle className="w-5 h-5 shrink-0" />
            Último envase registrado
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-green-950/90">
            <li>
              <span className="font-medium">Produção (id):</span>{' '}
              <code className="text-xs bg-white/80 px-1 rounded">{ultimoResumo.producaoId}</code> — copie para SQL /
              suporte
            </li>
            <li>
              <span className="font-medium">Lote prod. nº:</span> {ultimoResumo.numeroLote}
            </li>
            <li>
              <span className="font-medium">Caixas geradas:</span> {ultimoResumo.numCaixas}
            </li>
            <li>
              <span className="font-medium">Baldes consumidos:</span> {ultimoResumo.numBaldes}
            </li>
            <li>
              <span className="font-medium">Proporção usada:</span> {ultimoResumo.baldesPorCaixa} balde(s) / caixa
            </li>
          </ul>
          <p className="text-xs text-green-800/90 pt-1">
            Relatórios: filtre <code className="bg-white/70 px-1 rounded">producoes.tipo = &apos;ENVASE_CAIXA&apos;</code> e{' '}
            <code className="bg-white/70 px-1 rounded">envase_produto_balde_id</code> no Supabase. Histórico geral em{' '}
            <Link href="/producao" className="underline font-medium">
              Produção
            </Link>
            .
          </p>
        </div>
      )}

      {etiquetasPendentes.length > 0 && (
        <div ref={painelImpressaoRef} className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-sm text-blue-900">
            <strong>{etiquetasPendentes.length}</strong> etiqueta(s) 60×60 (caixa). Prévia ou impressão (navegador / Pi
            indústria).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void previa()} disabled={previsualizando}>
              {previsualizando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              Ver prévia
            </Button>
            <Button type="button" variant="primary" onClick={() => void imprimirNavegador()} disabled={imprimindo}>
              {imprimindo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
              Navegador
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-emerald-800/40"
              onClick={() => void imprimirPi()}
              disabled={imprimindoPi || piCfgLoading || !piPrintAvailable}
            >
              {imprimindoPi ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Server className="w-4 h-4 mr-2" />}
              Zebra / Pi
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-5 py-3 text-left bg-slate-50 border-b border-gray-100"
          onClick={() => setConfigAberta((v) => !v)}
        >
          <span className="text-sm font-semibold text-gray-900">
            1. Configuração do envase
            {!configAberta && produtoCaixaId && produtoBaldeId && (
              <span className="font-normal text-gray-500 ml-2">
                — {nomeCaixa} · {baldesPorCaixa} balde(s)/caixa
              </span>
            )}
          </span>
          {configAberta ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        {configAberta && (
          <div className="p-5 space-y-4">
            <Select
              label="Produto caixa (acabado)"
              required
              value={produtoCaixaId}
              onChange={(e) => setProdutoCaixaId(e.target.value)}
              options={[
                { value: '', label: 'Selecione…' },
                ...produtosAcabado.map((p) => ({ value: p.id, label: p.nome })),
              ]}
            />
            <Select
              label="Produto balde (matéria-prima)"
              required
              value={produtoBaldeId}
              onChange={(e) => setProdutoBaldeId(e.target.value)}
              options={[
                { value: '', label: 'Selecione…' },
                ...produtosAcabado.map((p) => ({ value: p.id, label: p.nome })),
              ]}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Baldes por caixa (inteiro ≥ 1)"
                type="number"
                min={1}
                step={1}
                value={baldesPorCaixaStr}
                onChange={(e) => setBaldesPorCaixaStr(e.target.value)}
                required
              />
              <Input
                label="Validade caixa (dias)"
                type="number"
                min={1}
                step={1}
                value={diasValidadeStr}
                onChange={(e) => setDiasValidadeStr(e.target.value)}
                required
              />
            </div>
            <Select
              label="Local (indústria — caixas nascem aqui)"
              required
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              disabled={Boolean(defaultWarehouseId)}
              options={[{ value: '', label: 'Selecione…' }, ...warehouses.map((w) => ({ value: w.id, label: w.nome }))]}
            />
            <Input label="Observações (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border-2 border-emerald-200 p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-900">2. Bipar baldes no estoque da indústria</p>

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-800 space-y-1">
          <p>
            <span className="font-semibold">Resumo:</span> {baldesEscaneados.length} balde(s)
            {numCaixasPrevistas != null ? (
              <>
                {' '}
                → <span className="font-semibold text-emerald-800">{numCaixasPrevistas}</span> caixa(s) (
                {baldesPorCaixa} balde(s)/caixa)
              </>
            ) : baldesEscaneados.length > 0 ? (
              <span className="text-amber-800"> — complete até múltiplo de «baldes por caixa».</span>
            ) : (
              <span className="text-gray-500"> — escaneie os baldes triados.</span>
            )}
          </p>
        </div>

        <QRScanner onScan={(code) => void processarCodigo(code)} label="Ativar leitor de QR (câmera)" />
        {!mostrarManual ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => setMostrarManual(true)}>
            Digitar código manualmente
          </Button>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Token ou QR"
              value={tokenManual}
              onChange={(e) => setTokenManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void processarCodigo(tokenManual)}
            />
            <Button type="button" variant="primary" onClick={() => void processarCodigo(tokenManual)} disabled={buscandoQr}>
              {buscandoQr ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </Button>
          </div>
        )}

        {baldesEscaneados.length > 0 && (
          <ul className="max-h-52 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {baldesEscaneados.map((b, i) => (
              <li key={b.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="text-gray-500 tabular-nums w-6">{i + 1}.</span>
                <span className="font-mono flex-1 truncate">{b.token_short || b.token_qr}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0 p-1 h-9 w-9"
                  aria-label="Remover"
                  onClick={() => setBaldesEscaneados((prev) => prev.filter((x) => x.id !== b.id))}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {erro && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
            {erro}
          </p>
        )}

        <Button
          type="button"
          variant="primary"
          className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700"
          disabled={!formularioOk || saving || !usuario?.id}
          onClick={() => void registrar()}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Package className="w-4 h-4 mr-2" />}
          3. Registrar envase e gerar caixas
        </Button>
        {!formularioOk && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Configure produtos e proporção (passo 1) e bipe baldes até o total ser múltiplo de «baldes por caixa».
          </p>
        )}
      </div>
    </div>
  );
}
