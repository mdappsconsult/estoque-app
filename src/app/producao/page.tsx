'use client';

import { useState } from 'react';
import { ChefHat, Loader2, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { gerarTokenQR, gerarTokenShort } from '@/lib/services/itens';
import { registrarAuditoria } from '@/lib/services/auditoria';
import { Produto, Local } from '@/types/database';

export default function ProducaoPage() {
  const { usuario } = useAuth();
  const { data: produtos, loading } = useRealtimeQuery<Produto>({
    table: 'produtos',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const warehouses = locais.filter(l => l.tipo === 'WAREHOUSE');

  const [form, setForm] = useState({ produto_id: '', quantidade: '', local_id: '', data_validade: '', observacoes: '' });
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ itens: number } | null>(null);

  const handleSubmit = async () => {
    if (!usuario) return alert('Faça login');
    setSaving(true);
    setResultado(null);
    try {
      const qtd = Number(form.quantidade);
      // Gerar itens unitários
      const itens = Array.from({ length: qtd }, () => ({
        token_qr: gerarTokenQR(),
        token_short: gerarTokenShort(),
        produto_id: form.produto_id,
        local_atual_id: form.local_id,
        estado: 'EM_ESTOQUE' as const,
        data_validade: form.data_validade || null,
        data_producao: new Date().toISOString(),
      }));

      const { error } = await supabase.from('itens').insert(itens);
      if (error) throw error;

      // Registrar produção
      await supabase.from('producoes').insert({
        produto_id: form.produto_id,
        quantidade: qtd,
        responsavel: usuario.nome,
        observacoes: form.observacoes || null,
      });

      await registrarAuditoria({
        usuario_id: usuario.id,
        local_id: form.local_id,
        acao: 'PRODUCAO',
        detalhes: { produto_id: form.produto_id, quantidade: qtd },
      });

      setResultado({ itens: qtd });
      setForm({ produto_id: '', quantidade: '', local_id: '', data_validade: '', observacoes: '' });
    } catch (err: any) {
      alert(err?.message || 'Erro');
    } finally {
      setSaving(false);
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
          <p className="font-semibold text-green-800">{resultado.itens} itens gerados com QR!</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <Select label="Produto" required options={[{ value: '', label: 'Selecione...' }, ...produtos.map(p => ({ value: p.id, label: p.nome }))]} value={form.produto_id} onChange={(e) => setForm({ ...form, produto_id: e.target.value })} />
        <Input label="Quantidade" type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} required />
        <Select label="Local" required options={[{ value: '', label: 'Selecione...' }, ...warehouses.map(l => ({ value: l.id, label: l.nome }))]} value={form.local_id} onChange={(e) => setForm({ ...form, local_id: e.target.value })} />
        <Input label="Data de Validade" type="date" value={form.data_validade} onChange={(e) => setForm({ ...form, data_validade: e.target.value })} />
        <Input label="Observações" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        <Button variant="primary" className="w-full" onClick={handleSubmit} disabled={saving || !form.produto_id || !form.quantidade || !form.local_id}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Registrar Produção
        </Button>
      </div>
    </div>
  );
}
