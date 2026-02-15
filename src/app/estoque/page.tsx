'use client';

import { useState } from 'react';
import { Boxes, Loader2, Search, MapPin } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/lib/supabase';
import { Local } from '@/types/database';

interface ItemRow {
  id: string;
  token_qr: string;
  estado: string;
  local_atual_id: string | null;
  data_validade: string | null;
  created_at: string;
  produto: { id: string; nome: string };
  local_atual: { id: string; nome: string; tipo: string } | null;
}

export default function EstoquePage() {
  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const { data: itens, loading } = useRealtimeQuery<ItemRow>({
    table: 'itens',
    select: '*, produto:produtos(id, nome), local_atual:locais!local_atual_id(id, nome, tipo)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('EM_ESTOQUE');

  const filtrados = itens.filter(i => {
    if (filtroEstado && i.estado !== filtroEstado) return false;
    if (filtroLocal && i.local_atual_id !== filtroLocal) return false;
    if (searchTerm && !i.produto?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) && !i.token_qr.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Agrupar por produto+local
  const agrupado: Record<string, { nome: string; local: string; count: number; proximaValidade: string | null }> = {};
  filtrados.forEach(i => {
    const key = `${i.produto?.id}-${i.local_atual_id}`;
    if (!agrupado[key]) {
      agrupado[key] = { nome: i.produto?.nome || '?', local: i.local_atual?.nome || 'Sem local', count: 0, proximaValidade: null };
    }
    agrupado[key].count++;
    if (i.data_validade) {
      if (!agrupado[key].proximaValidade || i.data_validade < agrupado[key].proximaValidade!) {
        agrupado[key].proximaValidade = i.data_validade;
      }
    }
  });

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
        <Badge variant="info">{filtrados.length} itens</Badge>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Input placeholder="Buscar produto ou QR" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <Select
            options={[{ value: '', label: 'Todos os locais' }, ...locais.map(l => ({ value: l.id, label: l.nome }))]}
            value={filtroLocal}
            onChange={(e) => setFiltroLocal(e.target.value)}
          />
          <Select
            options={[
              { value: '', label: 'Todos os estados' },
              { value: 'EM_ESTOQUE', label: 'Em Estoque' },
              { value: 'EM_TRANSFERENCIA', label: 'Em Transferência' },
              { value: 'BAIXADO', label: 'Baixado' },
              { value: 'DESCARTADO', label: 'Descartado' },
            ]}
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(agrupado).map(([key, g]) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{g.nome}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{g.local}</span>
                {g.proximaValidade && (
                  <span className="text-xs text-gray-400">Val: {new Date(g.proximaValidade).toLocaleDateString('pt-BR')}</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{g.count}</p>
              <p className="text-xs text-gray-400">unidades</p>
            </div>
          </div>
        ))}
        {Object.keys(agrupado).length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Boxes className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum item encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
