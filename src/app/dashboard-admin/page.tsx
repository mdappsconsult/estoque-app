'use client';

import { BarChart3, Loader2, Boxes, Truck, Archive, Timer, AlertTriangle } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';

interface ItemRow { id: string; estado: string; data_validade: string | null; created_at: string }
interface TransRow { id: string; status: string }
interface BaixaRow { id: string; created_at: string }
interface PerdaRow { id: string; created_at: string }

export default function DashboardAdminPage() {
  const { data: itens, loading: l1 } = useRealtimeQuery<ItemRow>({ table: 'itens', select: 'id, estado, data_validade, created_at' });
  const { data: transferencias, loading: l2 } = useRealtimeQuery<TransRow>({ table: 'transferencias', select: 'id, status' });
  const { data: baixas, loading: l3 } = useRealtimeQuery<BaixaRow>({ table: 'baixas', select: 'id, created_at' });
  const { data: perdas } = useRealtimeQuery<PerdaRow>({ table: 'perdas', select: 'id, created_at' });

  const loading = l1 || l2 || l3;

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  const emEstoque = itens.filter(i => i.estado === 'EM_ESTOQUE').length;
  const emTransferencia = itens.filter(i => i.estado === 'EM_TRANSFERENCIA').length;
  const transPendentes = transferencias.filter(t => t.status === 'AWAITING_ACCEPT' || t.status === 'IN_TRANSIT').length;

  const hoje = new Date().toISOString().slice(0, 10);
  const baixasHoje = baixas.filter(b => b.created_at.slice(0, 10) === hoje).length;
  const perdasHoje = perdas.filter(p => p.created_at.slice(0, 10) === hoje).length;

  const agora = new Date();
  const em7dias = new Date(); em7dias.setDate(em7dias.getDate() + 7);
  const alertasValidade = itens.filter(i => i.estado === 'EM_ESTOQUE' && i.data_validade && new Date(i.data_validade) <= em7dias && new Date(i.data_validade) >= agora).length;
  const vencidos = itens.filter(i => i.estado === 'EM_ESTOQUE' && i.data_validade && new Date(i.data_validade) < agora).length;

  const cards = [
    { title: 'Em Estoque', value: emEstoque, icon: Boxes, color: 'bg-green-100', iconColor: 'text-green-600' },
    { title: 'Em Transferência', value: emTransferencia, icon: Truck, color: 'bg-blue-100', iconColor: 'text-blue-600' },
    { title: 'Transf. Pendentes', value: transPendentes, icon: Truck, color: 'bg-yellow-100', iconColor: 'text-yellow-600' },
    { title: 'Baixas Hoje', value: baixasHoje, icon: Archive, color: 'bg-orange-100', iconColor: 'text-orange-600' },
    { title: 'Perdas Hoje', value: perdasHoje, icon: AlertTriangle, color: 'bg-red-100', iconColor: 'text-red-600' },
    { title: 'Alerta Validade (7d)', value: alertasValidade, icon: Timer, color: 'bg-yellow-100', iconColor: 'text-yellow-600' },
    { title: 'Vencidos', value: vencidos, icon: Timer, color: 'bg-red-100', iconColor: 'text-red-600' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><BarChart3 className="w-5 h-5 text-red-600" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Admin</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map(c => (
          <div key={c.title} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${c.color}`}>
              <c.icon className={`w-5 h-5 ${c.iconColor}`} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{c.value}</p>
            <p className="text-sm text-gray-500 mt-1">{c.title}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumo</h2>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-500">Total de itens no sistema</span>
            <span className="font-semibold">{itens.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total de transferências</span>
            <span className="font-semibold">{transferencias.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total de baixas</span>
            <span className="font-semibold">{baixas.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total de perdas</span>
            <span className="font-semibold">{perdas.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
