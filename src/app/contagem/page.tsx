'use client';

import { useState } from 'react';
import { ClipboardCheck, Loader2, CheckCircle, Save } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { createContagem } from '@/lib/services/contagem';
import { supabase } from '@/lib/supabase';

interface EstoqueRow {
  id: string;
  produto_id: string;
  quantidade: number;
  produto: { id: string; nome: string; contagem_do_dia: boolean };
}

export default function ContagemPage() {
  const { usuario } = useAuth();
  const { data: estoque, loading } = useRealtimeQuery<EstoqueRow>({
    table: 'estoque',
    select: '*, produto:produtos(id, nome, contagem_do_dia)',
  });

  const produtosContagem = estoque.filter(e => e.produto?.contagem_do_dia);

  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const setQuantidade = (produtoId: string, val: string) => {
    setContagens(prev => ({ ...prev, [produtoId]: val }));
  };

  const handleSalvar = async () => {
    if (!usuario) return alert('Faça login');
    setSaving(true);
    try {
      const itens = produtosContagem
        .filter(e => contagens[e.produto_id] !== undefined && contagens[e.produto_id] !== '')
        .map(e => ({
          produto_id: e.produto_id,
          quantidade_sistema: e.quantidade,
          quantidade_contada: Number(contagens[e.produto_id]),
        }));

      if (itens.length === 0) {
        alert('Preencha pelo menos um produto');
        setSaving(false);
        return;
      }

      await createContagem(usuario.nome, itens);
      setSucesso(true);
      setContagens({});
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
        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-purple-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contagem</h1>
          <p className="text-sm text-gray-500">Inventário: contada vs sistema</p>
        </div>
      </div>

      {sucesso && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <p className="font-semibold text-green-800">Contagem salva com sucesso!</p>
        </div>
      )}

      <div className="space-y-3">
        {produtosContagem.map(e => {
          const contada = contagens[e.produto_id];
          const diff = contada !== undefined && contada !== '' ? Number(contada) - e.quantidade : null;
          return (
            <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-900">{e.produto?.nome}</p>
                <Badge variant="default" size="sm">Sistema: {e.quantidade}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="0"
                  placeholder="Qtd contada"
                  value={contagens[e.produto_id] || ''}
                  onChange={(ev) => setQuantidade(e.produto_id, ev.target.value)}
                  className="w-32"
                />
                {diff !== null && (
                  <Badge variant={diff === 0 ? 'success' : diff > 0 ? 'info' : 'error'} size="sm">
                    {diff > 0 ? `+${diff}` : diff}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {produtosContagem.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhum produto marcado para contagem do dia</p>
        </div>
      )}

      {produtosContagem.length > 0 && (
        <Button variant="primary" className="w-full mt-6" onClick={handleSalvar} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Contagem
        </Button>
      )}
    </div>
  );
}
