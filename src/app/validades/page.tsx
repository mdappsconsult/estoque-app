'use client';

import { Timer, Loader2, AlertTriangle } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useState } from 'react';

interface ItemRow {
  id: string;
  token_qr: string;
  estado: string;
  data_validade: string | null;
  produto: { nome: string };
  local_atual: { nome: string } | null;
}

export default function ValidadesPage() {
  const { data: itens, loading } = useRealtimeQuery<ItemRow>({
    table: 'itens',
    select: '*, produto:produtos(nome), local_atual:locais!local_atual_id(nome)',
    orderBy: { column: 'data_validade', ascending: true },
  });

  const [dias, setDias] = useState(7);

  const agora = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + dias);

  const proximos = itens.filter(i =>
    i.estado === 'EM_ESTOQUE' &&
    i.data_validade &&
    new Date(i.data_validade) <= limite &&
    new Date(i.data_validade) >= agora
  );

  const vencidos = itens.filter(i =>
    i.estado === 'EM_ESTOQUE' &&
    i.data_validade &&
    new Date(i.data_validade) < agora
  );

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><Timer className="w-5 h-5 text-red-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Validades</h1>
          <p className="text-sm text-gray-500">Itens próximos do vencimento</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {[3, 7, 14, 30].map(d => (
          <button
            key={d}
            onClick={() => setDias(d)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${dias === d ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {d} dias
          </button>
        ))}
      </div>

      {vencidos.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-red-600 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Vencidos ({vencidos.length})
          </h2>
          <div className="space-y-2 mb-6">
            {vencidos.slice(0, 50).map(i => (
              <div key={i.id} className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-red-800">{i.produto?.nome}</p>
                  <p className="text-xs text-red-400">{i.local_atual?.nome} • {i.token_qr}</p>
                </div>
                <div className="text-right">
                  <Badge variant="error" size="sm">Vencido</Badge>
                  <p className="text-xs text-red-400 mt-1">{new Date(i.data_validade!).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="text-lg font-semibold text-gray-700 mb-3">Próximos {dias} dias ({proximos.length})</h2>
      <div className="space-y-2">
        {proximos.map(i => {
          const diasRestantes = Math.ceil((new Date(i.data_validade!).getTime() - agora.getTime()) / 86400000);
          return (
            <div key={i.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{i.produto?.nome}</p>
                <p className="text-xs text-gray-400">{i.local_atual?.nome} • {i.token_qr}</p>
              </div>
              <div className="text-right">
                <Badge variant={diasRestantes <= 2 ? 'error' : diasRestantes <= 5 ? 'warning' : 'info'} size="sm">
                  {diasRestantes}d
                </Badge>
                <p className="text-xs text-gray-400 mt-1">{new Date(i.data_validade!).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          );
        })}
        {proximos.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Timer className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum item próximo do vencimento</p>
          </div>
        )}
      </div>
    </div>
  );
}
