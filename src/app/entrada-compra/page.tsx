'use client';

import { useState } from 'react';
import { PackageCheck, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { criarLoteCompra } from '@/lib/services/lotes-compra';
import { supabase } from '@/lib/supabase';
import { Produto, Local } from '@/types/database';

export default function EntradaCompraPage() {
  const { usuario } = useAuth();
  const { data: produtos, loading: loadProd } = useRealtimeQuery<Produto>({
    table: 'produtos',
    select: '*',
    orderBy: { column: 'nome', ascending: true },
  });
  const produtosCompra = produtos.filter(
    (p) => !p.origem || p.origem === 'COMPRA' || p.origem === 'AMBOS'
  );
  const { data: locais } = useRealtimeQuery<Local>({
    table: 'locais',
    orderBy: { column: 'nome', ascending: true },
  });

  const warehouses = locais.filter(l => l.tipo === 'WAREHOUSE');

  const [form, setForm] = useState({
    produto_id: '', quantidade: '', custo_unitario: '', fornecedor: '', lote_fornecedor: '', local_id: '', data_validade: '',
  });
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ itens: number } | null>(null);
  const [hintCompra, setHintCompra] = useState<{
    estoqueMinimo: number;
    qtdEmEstoque: number;
  } | null>(null);

  const handleProdutoChange = async (produtoId: string) => {
    if (!produtoId) {
      setForm((f) => ({ ...f, produto_id: '' }));
      setHintCompra(null);
      return;
    }
    const p = produtos.find((pr) => pr.id === produtoId);
    if (!p) return;

    const now = new Date();
    now.setDate(now.getDate() + p.validade_dias);

    setForm((f) => ({
      ...f,
      produto_id: produtoId,
      data_validade: now.toISOString().slice(0, 10),
      fornecedor: p.fornecedor || f.fornecedor,
      custo_unitario:
        p.custo_referencia != null ? String(p.custo_referencia) : f.custo_unitario,
    }));

    const { count } = await supabase
      .from('itens')
      .select('id', { count: 'exact', head: true })
      .eq('produto_id', produtoId)
      .eq('estado', 'EM_ESTOQUE');

    setHintCompra({
      estoqueMinimo: p.estoque_minimo ?? 0,
      qtdEmEstoque: count ?? 0,
    });
  };

  const handleSubmit = async () => {
    if (!usuario) return alert('Faça login primeiro');
    setSaving(true);
    setResultado(null);
    try {
      const res = await criarLoteCompra(
        {
          produto_id: form.produto_id,
          quantidade: Number(form.quantidade),
          custo_unitario: Number(form.custo_unitario),
          fornecedor: form.fornecedor || null,
          lote_fornecedor: form.lote_fornecedor || null,
          local_id: form.local_id,
        },
        form.data_validade || null,
        usuario.id
      );
      setResultado({ itens: res.itensGerados });
      setForm({ produto_id: '', quantidade: '', custo_unitario: '', fornecedor: '', lote_fornecedor: '', local_id: '', data_validade: '' });
      setHintCompra(null);
    } catch (err: any) {
      alert(err?.message || 'Erro ao registrar compra');
    } finally {
      setSaving(false);
    }
  };

  if (loadProd) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <PackageCheck className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entrada de Compra</h1>
          <p className="text-sm text-gray-500">Gera lote + itens unitários com QR</p>
        </div>
      </div>

      {resultado && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <div>
            <p className="font-semibold text-green-800">Lote registrado!</p>
            <p className="text-sm text-green-600">{resultado.itens} itens gerados com QR</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <Select
          label="Produto"
          required
          options={[
            { value: '', label: 'Selecione...' },
            ...produtosCompra.map((p) => ({ value: p.id, label: p.nome })),
          ]}
          value={form.produto_id}
          onChange={(e) => void handleProdutoChange(e.target.value)}
        />
        {produtosCompra.length === 0 && (
          <p className="text-sm text-amber-600">
            Nenhum produto para compra. Cadastre com origem &quot;Compra&quot; ou &quot;Compra e produção&quot;.
          </p>
        )}
        {hintCompra && form.produto_id && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              hintCompra.qtdEmEstoque <= hintCompra.estoqueMinimo
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-gray-200 bg-gray-50 text-gray-700'
            }`}
          >
            <p className="font-medium flex items-center gap-2">
              {hintCompra.qtdEmEstoque <= hintCompra.estoqueMinimo && (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              Estoque atual: <span className="tabular-nums">{hintCompra.qtdEmEstoque}</span> unidades (QR) no armazém
            </p>
            <p className="mt-1 text-xs opacity-90">
              Estoque mínimo cadastrado: <span className="tabular-nums font-medium">{hintCompra.estoqueMinimo}</span>
              {hintCompra.qtdEmEstoque <= hintCompra.estoqueMinimo && hintCompra.estoqueMinimo > 0
                ? ' — abaixo ou no limite; considere repor.'
                : null}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Quantidade" type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} required />
          <Input label="Custo Unitário (R$)" type="number" step="0.01" min="0" value={form.custo_unitario} onChange={(e) => setForm({ ...form, custo_unitario: e.target.value })} required />
        </div>
        <Input label="Fornecedor" value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
        <Input label="Lote do Fornecedor" value={form.lote_fornecedor} onChange={(e) => setForm({ ...form, lote_fornecedor: e.target.value })} />
        <Select
          label="Local de Entrada"
          required
          options={[{ value: '', label: 'Selecione...' }, ...warehouses.map(l => ({ value: l.id, label: l.nome }))]}
          value={form.local_id}
          onChange={(e) => setForm({ ...form, local_id: e.target.value })}
        />
        <Input label="Data de Validade" type="date" value={form.data_validade} onChange={(e) => setForm({ ...form, data_validade: e.target.value })} required />

        <Button
          variant="primary"
          className="w-full"
          onClick={handleSubmit}
          disabled={saving || !form.produto_id || !form.quantidade || !form.custo_unitario || !form.local_id || !form.data_validade}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Registrar Compra
        </Button>
      </div>
    </div>
  );
}
