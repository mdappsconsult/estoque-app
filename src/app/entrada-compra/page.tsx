'use client';

import { useState } from 'react';
import { PackageCheck, Loader2, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { criarLoteCompra } from '@/lib/services/lotes-compra';
import { Produto, Local } from '@/types/database';

export default function EntradaCompraPage() {
  const { usuario } = useAuth();
  const { data: produtos, loading: loadProd } = useRealtimeQuery<Produto>({
    table: 'produtos',
    select: '*',
    orderBy: { column: 'nome', ascending: true },
  });
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

  const produtoSelecionado = produtos.find(p => p.id === form.produto_id);

  const calcularValidade = () => {
    if (!produtoSelecionado) return '';
    const now = new Date();
    now.setDate(now.getDate() + produtoSelecionado.validade_dias);
    now.setHours(now.getHours() + produtoSelecionado.validade_horas);
    now.setMinutes(now.getMinutes() + produtoSelecionado.validade_minutos);
    return now.toISOString().slice(0, 16);
  };

  const handleProdutoChange = (produtoId: string) => {
    setForm(f => ({ ...f, produto_id: produtoId }));
    const p = produtos.find(pr => pr.id === produtoId);
    if (p) {
      const now = new Date();
      now.setDate(now.getDate() + p.validade_dias);
      setForm(f => ({ ...f, produto_id: produtoId, data_validade: now.toISOString().slice(0, 10) }));
    }
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
          options={[{ value: '', label: 'Selecione...' }, ...produtos.map(p => ({ value: p.id, label: p.nome }))]}
          value={form.produto_id}
          onChange={(e) => handleProdutoChange(e.target.value)}
        />
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
        <Input label="Data de Validade" type="date" value={form.data_validade} onChange={(e) => setForm({ ...form, data_validade: e.target.value })} />

        <Button
          variant="primary"
          className="w-full"
          onClick={handleSubmit}
          disabled={saving || !form.produto_id || !form.quantidade || !form.custo_unitario || !form.local_id}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Registrar Compra
        </Button>
      </div>
    </div>
  );
}
