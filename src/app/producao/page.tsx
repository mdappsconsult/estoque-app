'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChefHat, Loader2, CheckCircle, Plus, Trash2, Server, Eye } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { registrarProducaoComItens } from '@/lib/services/producao';
import { errMessage } from '@/lib/errMessage';
import { contarItensDisponiveisLocal } from '@/lib/services/itens';
import { supabase } from '@/lib/supabase';
import { Produto, Local } from '@/types/database';
import { usePiPrintBridgeConfig } from '@/hooks/usePiPrintBridgeConfig';
import {
  abrirPreviaEtiquetasEmJanela,
  confirmarImpressao,
  FORMATO_ETIQUETA_INDUSTRIA,
  imprimirEtiquetasEmJobUnico,
  type EtiquetaParaImpressao,
} from '@/lib/printing/label-print';
import { enviarEtiquetasParaPiEmMultiplosJobs } from '@/lib/printing/pi-print-ws-client';

function novaLinhaInsumo() {
  return {
    key: typeof crypto !== 'undefined' ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`,
    produto_id: '',
    quantidade: '',
  };
}

export default function ProducaoPage() {
  const { usuario } = useAuth();
  const {
    loading: piCfgLoading,
    available: piPrintAvailable,
    connection: piConnection,
  } = usePiPrintBridgeConfig({ papel: 'industria' });
  const { data: produtos, loading } = useRealtimeQuery<Produto>({
    table: 'produtos',
    orderBy: { column: 'nome', ascending: true },
  });
  const produtosProducao = produtos.filter(
    (p) => !p.origem || p.origem === 'PRODUCAO' || p.origem === 'AMBOS'
  );
  const produtosInsumo = produtos.filter(
    (p) => !p.origem || p.origem === 'COMPRA' || p.origem === 'AMBOS'
  );
  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const warehouses = locais.filter((l) => l.tipo === 'WAREHOUSE');

  const [form, setForm] = useState({
    produto_id: '',
    num_baldes: '',
    local_id: '',
    dias_validade: '',
    observacoes: '',
  });
  const [linhasInsumo, setLinhasInsumo] = useState(() => [novaLinhaInsumo()]);
  const [disponivelPorProduto, setDisponivelPorProduto] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ itens: number; baldes: number } | null>(null);
  const [etiquetasPendentesImpressao, setEtiquetasPendentesImpressao] = useState<Array<{
    id: string;
    dataProducao: string;
    dataValidade: string;
    lote: string;
    tokenQr: string;
    tokenShort: string | null;
  }>>([]);
  const [produtoParaImpressao, setProdutoParaImpressao] = useState('Produto');
  const [localParaImpressao, setLocalParaImpressao] = useState('Indústria');
  const [imprimindo, setImprimindo] = useState(false);
  const [imprimindoPi, setImprimindoPi] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [previsualizandoModal, setPrevisualizandoModal] = useState(false);
  const [avisoHttpsPi, setAvisoHttpsPi] = useState(false);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState('');
  const diasValidadeNumero = Number(form.dias_validade);
  const dataValidadePrevista = Number.isInteger(diasValidadeNumero) && diasValidadeNumero > 0
    ? (() => {
        const data = new Date();
        data.setDate(data.getDate() + diasValidadeNumero);
        return data.toISOString().slice(0, 10);
      })()
    : null;
  const produtoSelecionadoNome = produtos.find((produto) => produto.id === form.produto_id)?.nome || '-';
  const localSelecionadoNome = warehouses.find((local) => local.id === form.local_id)?.nome || '-';

  const produtosInsumoIdsChave = useMemo(
    () =>
      [...new Set(linhasInsumo.map((l) => l.produto_id).filter(Boolean))].sort().join(','),
    [linhasInsumo]
  );

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!form.local_id || !produtosInsumoIdsChave) {
        if (!cancel) setDisponivelPorProduto({});
        return;
      }
      const ids = produtosInsumoIdsChave.split(',').filter(Boolean);
      const next: Record<string, number> = {};
      for (const pid of ids) {
        try {
          next[pid] = await contarItensDisponiveisLocal(pid, form.local_id);
        } catch {
          next[pid] = 0;
        }
      }
      if (!cancel) setDisponivelPorProduto(next);
    })();
    return () => {
      cancel = true;
    };
  }, [form.local_id, produtosInsumoIdsChave]);

  useEffect(() => {
    if (!piConnection?.wsUrl) {
      setAvisoHttpsPi(false);
      return;
    }
    const u = piConnection.wsUrl.toLowerCase();
    setAvisoHttpsPi(window.location.protocol === 'https:' && u.startsWith('ws:'));
  }, [piConnection]);

  const consumosParaServico = useMemo(() => {
    return linhasInsumo
      .map((l) => ({
        produtoId: l.produto_id,
        quantidade: Math.floor(Number(l.quantidade)),
      }))
      .filter((c) => c.produtoId && Number.isFinite(c.quantidade) && c.quantidade > 0);
  }, [linhasInsumo]);

  const numBaldesInt = Math.floor(Number(form.num_baldes));
  const formularioValido =
    Boolean(form.produto_id) &&
    Number.isInteger(numBaldesInt) &&
    numBaldesInt > 0 &&
    Boolean(form.local_id) &&
    Number.isInteger(diasValidadeNumero) &&
    diasValidadeNumero > 0 &&
    consumosParaServico.length > 0;

  const handleSubmit = async (): Promise<boolean> => {
    if (!usuario) {
      alert('Faça login');
      return false;
    }
    if (!formularioValido) {
      setErroConfirmacao('Preencha todos os campos obrigatórios (acabado, baldes, local, validade em dias e insumo com quantidade).');
      return false;
    }
    setErroConfirmacao('');
    setSaving(true);
    setResultado(null);
    try {
      const etiquetasGeradas = await registrarProducaoComItens({
        produtoId: form.produto_id,
        numBaldes: numBaldesInt,
        localId: form.local_id,
        consumos: consumosParaServico,
        diasValidade: diasValidadeNumero,
        observacoes: form.observacoes || null,
        usuarioId: usuario.id,
        responsavelNome: usuario.nome,
      });
      const produtoNome = produtos.find((produto) => produto.id === form.produto_id)?.nome || 'Produto';
      const nomeLocalGravado =
        warehouses.find((local) => local.id === form.local_id)?.nome || 'Indústria';
      setProdutoParaImpressao(produtoNome);
      setLocalParaImpressao(nomeLocalGravado);
      setEtiquetasPendentesImpressao(
        etiquetasGeradas.map((etiqueta) => ({
          id: etiqueta.id,
          dataProducao: etiqueta.dataProducao,
          dataValidade: etiqueta.dataValidade,
          lote: etiqueta.lote,
          tokenQr: etiqueta.tokenQr,
          tokenShort: etiqueta.tokenShort,
        }))
      );

      setResultado({ itens: numBaldesInt, baldes: numBaldesInt });
      setForm({
        produto_id: '',
        num_baldes: '',
        local_id: '',
        dias_validade: '',
        observacoes: '',
      });
      setLinhasInsumo([novaLinhaInsumo()]);
      setDisponivelPorProduto({});
      return true;
    } catch (err: unknown) {
      const msg = errMessage(err, 'Erro ao registrar produção');
      setErroConfirmacao(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const montarPayloadImpressao = () => {
    const agora = new Date().toISOString();
    const nomeLocal = localParaImpressao.trim() || 'Indústria';
    return etiquetasPendentesImpressao.map((etiqueta) => ({
      id: etiqueta.id,
      produtoNome: produtoParaImpressao,
      dataManipulacao: etiqueta.dataProducao,
      dataValidade: etiqueta.dataValidade,
      lote: etiqueta.lote,
      tokenQr: etiqueta.tokenQr,
      tokenShort: etiqueta.tokenShort || etiqueta.id.slice(0, 8).toUpperCase(),
      responsavel: usuario?.nome || 'OPERADOR',
      nomeLoja: nomeLocal,
      dataGeracaoIso: agora,
    }));
  };

  const imprimirEtiquetasGeradas = async () => {
    if (etiquetasPendentesImpressao.length === 0) return;
    if (!confirmarImpressao(etiquetasPendentesImpressao.length, FORMATO_ETIQUETA_INDUSTRIA)) return;

    setImprimindo(true);
    try {
      const abriuImpressao = await imprimirEtiquetasEmJobUnico(
        montarPayloadImpressao(),
        FORMATO_ETIQUETA_INDUSTRIA
      );
      if (!abriuImpressao) {
        throw new Error('Não foi possível abrir a janela de impressão. Libere pop-ups e tente novamente.');
      }

      const idsEtiquetas = etiquetasPendentesImpressao.map((etiqueta) => etiqueta.id);
      const { error: erroImpressa } = await supabase
        .from('etiquetas')
        .update({ impressa: true })
        .in('id', idsEtiquetas);
      if (erroImpressa) throw erroImpressa;

      setEtiquetasPendentesImpressao([]);
      alert('Etiquetas enviadas para impressão com sucesso.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao imprimir etiquetas');
    } finally {
      setImprimindo(false);
    }
  };

  /** Prévia no modal antes de gravar: amostra (até 3) com produto/local/validade do formulário. */
  const abrirPreviaEtiquetasModalProducao = async () => {
    if (!formularioValido || !dataValidadePrevista) return;
    setPrevisualizandoModal(true);
    setErroConfirmacao('');
    try {
      const amostras = Math.min(numBaldesInt, 3);
      const agora = new Date().toISOString();
      const valIso = `${dataValidadePrevista}T12:00:00.000Z`;
      const payload: EtiquetaParaImpressao[] = Array.from({ length: amostras }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        produtoNome: produtoSelecionadoNome,
        dataManipulacao: agora,
        dataValidade: valIso,
        lote: 'Após confirmar — lote gerado no registro',
        tokenQr: `PREVIA-PRODUCAO-${i + 1}`,
        tokenShort: `PREV${i + 1}`,
        responsavel: usuario?.nome?.trim() || 'OPERADOR',
        nomeLoja: localSelecionadoNome,
        dataGeracaoIso: agora,
        numeroSequenciaLoja: i + 1,
      }));
      const ok = await abrirPreviaEtiquetasEmJanela(payload, FORMATO_ETIQUETA_INDUSTRIA, {
        mensagemBarra: `Amostra de ${amostras} etiqueta(s) com estes dados. Total ao registrar: ${numBaldesInt}. Tokens e lote reais só após confirmar o registro.`,
      });
      if (!ok) throw new Error('Não foi possível abrir a prévia. Libere pop-ups.');
    } catch (e: unknown) {
      setErroConfirmacao(e instanceof Error ? e.message : 'Falha ao gerar prévia');
    } finally {
      setPrevisualizandoModal(false);
    }
  };

  const previsualizarEtiquetasProducao = async () => {
    if (etiquetasPendentesImpressao.length === 0) return;
    setPrevisualizando(true);
    try {
      const ok = await abrirPreviaEtiquetasEmJanela(montarPayloadImpressao(), FORMATO_ETIQUETA_INDUSTRIA, {
        mensagemBarra: 'Mesmo layout enviado à Zebra/Pi. Feche a aba e use os botões de impressão quando estiver certo.',
      });
      if (!ok) {
        throw new Error('Não foi possível abrir a prévia. Libere pop-ups e tente novamente.');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao gerar prévia');
    } finally {
      setPrevisualizando(false);
    }
  };

  const imprimirEtiquetasNoPi = async () => {
    if (etiquetasPendentesImpressao.length === 0) return;
    if (!piPrintAvailable || !piConnection) {
      alert(
        'Impressão na estação indisponível. Configure a ponte **indústria** em Configurações → Impressoras ou NEXT_PUBLIC_PI_PRINT_WS_URL_INDUSTRIA. Veja docs/RASPBERRY_INDUSTRIA_NOVO_PI.md.'
      );
      return;
    }
    if (!confirmarImpressao(etiquetasPendentesImpressao.length, FORMATO_ETIQUETA_INDUSTRIA)) return;

    setImprimindoPi(true);
    try {
      await enviarEtiquetasParaPiEmMultiplosJobs(
        montarPayloadImpressao(),
        FORMATO_ETIQUETA_INDUSTRIA,
        {
          jobNameBase: `producao-${etiquetasPendentesImpressao[0]?.lote || 'lote'}`.slice(0, 72),
          connection: piConnection,
          papel: 'industria',
        }
      );

      const idsEtiquetas = etiquetasPendentesImpressao.map((etiqueta) => etiqueta.id);
      const { error: erroImpressa } = await supabase
        .from('etiquetas')
        .update({ impressa: true })
        .in('id', idsEtiquetas);
      if (erroImpressa) throw erroImpressa;

      setEtiquetasPendentesImpressao([]);
      alert('Etiquetas 60×60 enviadas para a Zebra (Raspberry / indústria).');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao imprimir na estação Pi');
    } finally {
      setImprimindoPi(false);
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
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <ChefHat className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produção</h1>
          <p className="text-sm text-gray-500">
            Declare insumos gastos (unidades com QR), baldes produzidos e validade do acabado
          </p>
        </div>
      </div>

      {resultado && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <p className="font-semibold text-green-800">
            Produção registrada. {resultado.baldes} balde(s) → {resultado.itens} unidade(s) com QR geradas.
            Insumos baixados do estoque do local.
          </p>
        </div>
      )}

      {resultado && etiquetasPendentesImpressao.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-800 mb-2">
            Confirmação concluída. Etiquetas no formato <strong>60×60 mm</strong> (indústria). Use o navegador ou a
            Zebra ligada ao Raspberry da <strong>ponte indústria</strong>.
          </p>
          {avisoHttpsPi && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-3">
              Página em HTTPS com WebSocket <code className="text-[11px]">ws://</code> — o navegador pode bloquear.
              Use <code className="text-[11px]">wss://</code> (túnel) na configuração da ponte indústria.
            </p>
          )}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void previsualizarEtiquetasProducao()}
              disabled={previsualizando || imprimindo || imprimindoPi}
              title="Abre nova aba com o layout exato antes de imprimir"
            >
              {previsualizando ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              Ver prévia
            </Button>
            <Button variant="primary" onClick={imprimirEtiquetasGeradas} disabled={imprimindo || imprimindoPi || previsualizando}>
              {imprimindo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Navegador — {etiquetasPendentesImpressao.length} etiqueta(s) 60×60
            </Button>
            <Button
              variant="outline"
              onClick={() => void imprimirEtiquetasNoPi()}
              disabled={imprimindo || imprimindoPi || piCfgLoading || !piPrintAvailable || previsualizando}
              title={
                piPrintAvailable
                  ? 'Envia HTML 60×60 para o Raspberry (WebSocket → CUPS → Zebra)'
                  : 'Configure a ponte indústria em Configurações → Impressoras'
              }
            >
              {imprimindoPi ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Server className="w-4 h-4 mr-2" />
              )}
              Zebra / Pi (indústria)
            </Button>
          </div>

          <div className="mt-4 bg-white rounded-lg border border-blue-100 p-3">
            <p className="text-sm font-semibold text-gray-800 mb-2">
              Etiquetas geradas ({etiquetasPendentesImpressao.length})
            </p>
            <div className="max-h-56 overflow-y-auto space-y-2">
              {etiquetasPendentesImpressao.map((etiqueta, index) => (
                <div
                  key={etiqueta.id}
                  className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                >
                  <span className="font-medium text-gray-700">#{index + 1}</span>
                  <span className="font-mono text-gray-700">
                    {etiqueta.tokenShort || etiqueta.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-gray-500">
                    Val: {new Date(etiqueta.dataValidade).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <Select
          label="Produto acabado"
          required
          options={[
            { value: '', label: 'Selecione...' },
            ...produtosProducao.map((p) => ({ value: p.id, label: p.nome })),
          ]}
          value={form.produto_id}
          onChange={(e) => setForm({ ...form, produto_id: e.target.value })}
        />
        {produtosProducao.length === 0 && (
          <p className="text-sm text-amber-600">
            Nenhum produto marcado para produção. Cadastre com origem &quot;Produção&quot; ou &quot;Compra e produção&quot;.
          </p>
        )}
        <Input
          label="Quantidade de baldes"
          type="number"
          min="1"
          step="1"
          value={form.num_baldes}
          onChange={(e) => setForm({ ...form, num_baldes: e.target.value })}
          required
        />
        <p className="text-xs text-gray-500 -mt-2">
          Cada balde gera 1 unidade com QR do produto acabado (mesmo local).
        </p>
        <Select
          label="Local (indústria)"
          required
          options={[{ value: '', label: 'Selecione...' }, ...warehouses.map((l) => ({ value: l.id, label: l.nome }))]}
          value={form.local_id}
          onChange={(e) => setForm({ ...form, local_id: e.target.value })}
        />

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Insumos gastos (unidades com QR)</h2>
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 text-green-700"
              onClick={() => setLinhasInsumo((rows) => [...rows, novaLinhaInsumo()])}
            >
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Informe quantas unidades de cada insumo serão baixadas neste local (FIFO pela data de entrada).
          </p>
          <div className="space-y-3">
            {linhasInsumo.map((linha, index) => (
              <div
                key={linha.key}
                className="flex flex-col sm:flex-row sm:items-end gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100"
              >
                <div className="flex-1 min-w-0">
                  <Select
                    label={index === 0 ? 'Insumo' : undefined}
                    options={[
                      { value: '', label: 'Produto...' },
                      ...produtosInsumo
                        .filter((p) => p.id !== form.produto_id)
                        .map((p) => ({ value: p.id, label: p.nome })),
                    ]}
                    value={linha.produto_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLinhasInsumo((rows) =>
                        rows.map((r) => (r.key === linha.key ? { ...r, produto_id: v } : r))
                      );
                    }}
                  />
                </div>
                <div className="w-full sm:w-28">
                  <Input
                    label={index === 0 ? 'Qtd' : undefined}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="0"
                    value={linha.quantidade}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLinhasInsumo((rows) =>
                        rows.map((r) => (r.key === linha.key ? { ...r, quantidade: v } : r))
                      );
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 pb-1">
                  {linha.produto_id && form.local_id ? (
                    <span className="text-xs text-gray-600 whitespace-nowrap">
                      Disp.: {disponivelPorProduto[linha.produto_id] ?? '…'}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Remover linha"
                    onClick={() =>
                      setLinhasInsumo((rows) =>
                        rows.length <= 1 ? rows : rows.filter((r) => r.key !== linha.key)
                      )
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Input
          label="Validade (dias) — acabado"
          type="number"
          min="1"
          placeholder="Ex.: 30"
          value={form.dias_validade}
          onChange={(e) => setForm({ ...form, dias_validade: e.target.value })}
          required
        />
        {dataValidadePrevista && (
          <p className="text-xs text-gray-500 -mt-2">
            Data de validade gerada automaticamente:{' '}
            <span className="font-semibold text-gray-700">{dataValidadePrevista}</span>
          </p>
        )}
        <Input label="Observações" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        {!formularioValido && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-1">
            <p className="font-medium text-amber-900">Complete o formulário para habilitar o registro:</p>
            <ul className="list-disc list-inside text-amber-900/90">
              {!form.produto_id && <li>Escolha o produto acabado</li>}
              {(!Number.isInteger(numBaldesInt) || numBaldesInt < 1) && <li>Informe a quantidade de baldes (número inteiro ≥ 1)</li>}
              {!form.local_id && <li>Selecione o local (indústria)</li>}
              {(!Number.isInteger(diasValidadeNumero) || diasValidadeNumero < 1) && (
                <li>Informe validade em dias (número inteiro ≥ 1)</li>
              )}
              {consumosParaServico.length === 0 && (
                <li>Adicione pelo menos um insumo com quantidade a baixar</li>
              )}
            </ul>
          </div>
        )}
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            setErroConfirmacao('');
            setConfirmacaoAberta(true);
          }}
          disabled={saving || !formularioValido}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Registrar produção
        </Button>
      </div>

      <Modal
        isOpen={confirmacaoAberta}
        onClose={() => setConfirmacaoAberta(false)}
        title="Confirmar registro de produção"
        subtitle="Insumos serão baixados e o acabado entrará em estoque neste local"
        size="md"
      >
        <div className="p-6 space-y-4">
          {erroConfirmacao && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 whitespace-pre-wrap">
              {erroConfirmacao}
            </div>
          )}
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-semibold">Produto acabado:</span> {produtoSelecionadoNome}
            </p>
            <p>
              <span className="font-semibold">Baldes:</span> {form.num_baldes || '-'} (unidades QR geradas:{' '}
              {Number.isInteger(numBaldesInt) && numBaldesInt > 0 ? numBaldesInt : '-'})
            </p>
            <p>
              <span className="font-semibold">Local:</span> {localSelecionadoNome}
            </p>
            <p>
              <span className="font-semibold">Validade:</span> {form.dias_validade || '-'} dias
            </p>
            {dataValidadePrevista && (
              <p>
                <span className="font-semibold">Vencimento previsto:</span>{' '}
                {new Date(dataValidadePrevista).toLocaleDateString('pt-BR')}
              </p>
            )}
            <div className="pt-2 border-t border-gray-100">
              <p className="font-semibold mb-2">Insumos a consumir</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                {consumosParaServico.map((c) => (
                  <li key={c.produtoId}>
                    {produtos.find((p) => p.id === c.produtoId)?.nome ?? c.produtoId.slice(0, 8)} — {c.quantidade}{' '}
                    unidade(s)
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmacaoAberta(false)} disabled={saving || previsualizandoModal}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void abrirPreviaEtiquetasModalProducao()}
              disabled={saving || previsualizandoModal || !formularioValido}
              title="Abre nova aba com modelo 60×60 (amostra; QR/tokens fictícios até registrar)"
            >
              {previsualizandoModal ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              Ver modelo 60×60
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const ok = await handleSubmit();
                if (ok) setConfirmacaoAberta(false);
              }}
              disabled={saving || previsualizandoModal}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {saving ? 'Registrando…' : 'Confirmar registro'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
