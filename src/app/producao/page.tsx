'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChefHat, Loader2, CheckCircle, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { registrarProducaoComItens } from '@/lib/services/producao';
import { contarItensDisponiveisLocal } from '@/lib/services/itens';
import { supabase } from '@/lib/supabase';
import { Produto, Local } from '@/types/database';
import {
  confirmarImpressao,
  FORMATO_ETIQUETA_FLUXO_OPERACIONAL,
  imprimirEtiquetasEmJobUnico,
} from '@/lib/printing/label-print';

function novaLinhaInsumo() {
  return {
    key: typeof crypto !== 'undefined' ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`,
    produto_id: '',
    quantidade: '',
  };
}

export default function ProducaoPage() {
  const { usuario } = useAuth();
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
  const [imprimindo, setImprimindo] = useState(false);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
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

  const handleSubmit = async () => {
    if (!usuario) return alert('Faça login');
    setSaving(true);
    setResultado(null);
    try {
      const etiquetasGeradas = await registrarProducaoComItens({
        produtoId: form.produto_id,
        numBaldes: numBaldesInt,
        localId: form.local_id,
        consumos: consumosParaServico,
        diasValidade: Number(form.dias_validade),
        observacoes: form.observacoes || null,
        usuarioId: usuario.id,
        responsavelNome: usuario.nome,
      });
      const produtoNome = produtos.find((produto) => produto.id === form.produto_id)?.nome || 'Produto';
      setProdutoParaImpressao(produtoNome);
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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const imprimirEtiquetasGeradas = async () => {
    if (etiquetasPendentesImpressao.length === 0) return;
    if (!confirmarImpressao(etiquetasPendentesImpressao.length, FORMATO_ETIQUETA_FLUXO_OPERACIONAL)) return;

    setImprimindo(true);
    try {
      const agora = new Date().toISOString();
      const nomeLocal =
        localSelecionadoNome !== '-' ? localSelecionadoNome : 'Indústria';
      const abriuImpressao = await imprimirEtiquetasEmJobUnico(
        etiquetasPendentesImpressao.map((etiqueta) => ({
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
        })),
        FORMATO_ETIQUETA_FLUXO_OPERACIONAL
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
          <p className="text-sm text-blue-800 mb-3">
            Confirmação concluída. Clique no botão abaixo para imprimir as etiquetas desta produção.
          </p>
          <Button variant="primary" onClick={imprimirEtiquetasGeradas} disabled={imprimindo}>
            {imprimindo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Imprimir {etiquetasPendentesImpressao.length} etiquetas
          </Button>

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
        <Button
          variant="primary"
          className="w-full"
          onClick={() => setConfirmacaoAberta(true)}
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

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmacaoAberta(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                setConfirmacaoAberta(false);
                await handleSubmit();
              }}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirmar registro
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
