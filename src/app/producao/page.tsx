'use client';

import { useState } from 'react';
import { ChefHat, Loader2, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { registrarProducaoComItens } from '@/lib/services/producao';
import { supabase } from '@/lib/supabase';
import { Produto, Local } from '@/types/database';
import {
  confirmarImpressao,
  imprimirEtiquetasEmJobUnico,
  obterFormatoImpressaoPadrao,
} from '@/lib/printing/label-print';

export default function ProducaoPage() {
  const { usuario } = useAuth();
  const { data: produtos, loading } = useRealtimeQuery<Produto>({
    table: 'produtos',
    orderBy: { column: 'nome', ascending: true },
  });
  const produtosProducao = produtos.filter(
    (p) => !p.origem || p.origem === 'PRODUCAO' || p.origem === 'AMBOS'
  );
  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const warehouses = locais.filter(l => l.tipo === 'WAREHOUSE');

  const [form, setForm] = useState({ produto_id: '', quantidade: '', local_id: '', dias_validade: '', observacoes: '' });
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ itens: number } | null>(null);
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

  const handleSubmit = async () => {
    if (!usuario) return alert('Faça login');
    setSaving(true);
    setResultado(null);
    try {
      const qtd = Number(form.quantidade);
      const etiquetasGeradas = await registrarProducaoComItens({
        produtoId: form.produto_id,
        quantidade: qtd,
        localId: form.local_id,
        diasValidade: Number(form.dias_validade),
        observacoes: form.observacoes || null,
        usuarioId: usuario.id,
        responsavelNome: usuario.nome,
      });
      const produtoNome = produtos.find((produto) => produto.id === form.produto_id)?.nome || 'Produto';
      setProdutoParaImpressao(produtoNome);
      setEtiquetasPendentesImpressao(etiquetasGeradas.map((etiqueta) => ({
        id: etiqueta.id,
        dataProducao: etiqueta.dataProducao,
        dataValidade: etiqueta.dataValidade,
        lote: etiqueta.lote,
        tokenQr: etiqueta.tokenQr,
        tokenShort: etiqueta.tokenShort,
      })));

      setResultado({ itens: qtd });
      setForm({ produto_id: '', quantidade: '', local_id: '', dias_validade: '', observacoes: '' });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const imprimirEtiquetasGeradas = async () => {
    if (etiquetasPendentesImpressao.length === 0) return;
    if (!confirmarImpressao(etiquetasPendentesImpressao.length)) return;

    setImprimindo(true);
    try {
      const formato = obterFormatoImpressaoPadrao();
      const abriuImpressao = imprimirEtiquetasEmJobUnico(
        etiquetasPendentesImpressao.map((etiqueta) => ({
          id: etiqueta.id,
          produtoNome: produtoParaImpressao,
          dataManipulacao: etiqueta.dataProducao,
          dataValidade: etiqueta.dataValidade,
          lote: etiqueta.lote,
          tokenQr: etiqueta.tokenQr,
          tokenShort: etiqueta.tokenShort || etiqueta.id.slice(0, 8).toUpperCase(),
          responsavel: usuario?.nome || 'OPERADOR',
        })),
        formato
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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><ChefHat className="w-5 h-5 text-green-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produção</h1>
          <p className="text-sm text-gray-500">Entrada por produção interna</p>
        </div>
      </div>

      {resultado && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <p className="font-semibold text-green-800">
            Produção registrada com sucesso. {resultado.itens} itens gerados com QR.
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
                <div key={etiqueta.id} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                  <span className="font-medium text-gray-700">#{index + 1}</span>
                  <span className="font-mono text-gray-700">{etiqueta.tokenShort || etiqueta.id.slice(0, 8).toUpperCase()}</span>
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
          label="Produto"
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
        <Input label="Quantidade" type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} required />
        <Select label="Local" required options={[{ value: '', label: 'Selecione...' }, ...warehouses.map(l => ({ value: l.id, label: l.nome }))]} value={form.local_id} onChange={(e) => setForm({ ...form, local_id: e.target.value })} />
        <Input
          label="Validade (dias)"
          type="number"
          min="1"
          placeholder="Ex.: 30"
          value={form.dias_validade}
          onChange={(e) => setForm({ ...form, dias_validade: e.target.value })}
          required
        />
        {dataValidadePrevista && (
          <p className="text-xs text-gray-500 -mt-2">
            Data de validade gerada automaticamente: <span className="font-semibold text-gray-700">{dataValidadePrevista}</span>
          </p>
        )}
        <Input label="Observações" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        <Button
          variant="primary"
          className="w-full"
          onClick={() => setConfirmacaoAberta(true)}
          disabled={saving || !form.produto_id || !form.quantidade || !form.local_id || !form.dias_validade}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Registrar Produção
        </Button>
      </div>

      <Modal
        isOpen={confirmacaoAberta}
        onClose={() => setConfirmacaoAberta(false)}
        title="Confirmar registro de produção"
        subtitle="Revise os dados antes de salvar"
        size="sm"
      >
        <div className="p-6 space-y-4">
          <div className="space-y-2 text-sm text-gray-700">
            <p><span className="font-semibold">Produto:</span> {produtoSelecionadoNome}</p>
            <p><span className="font-semibold">Quantidade:</span> {form.quantidade || '-'}</p>
            <p><span className="font-semibold">Local:</span> {localSelecionadoNome}</p>
            <p><span className="font-semibold">Validade:</span> {form.dias_validade || '-'} dias</p>
            {dataValidadePrevista && (
              <p><span className="font-semibold">Vencimento previsto:</span> {new Date(dataValidadePrevista).toLocaleDateString('pt-BR')}</p>
            )}
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
