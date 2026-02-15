'use client';

import { useState } from 'react';
import { ClipboardCheck, Loader2, CheckCircle, Truck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { aceitarTransferencia, despacharTransferencia } from '@/lib/services/transferencias';

interface TransRow {
  id: string;
  tipo: string;
  status: string;
  origem_id: string;
  destino_id: string;
  criado_por: string;
  created_at: string;
  origem: { nome: string };
  destino: { nome: string };
  criador: { nome: string };
}

export default function AceitesPendentesPage() {
  const { usuario } = useAuth();
  const { data: transferencias, loading } = useRealtimeQuery<TransRow>({
    table: 'transferencias',
    select: '*, origem:locais!origem_id(nome), destino:locais!destino_id(nome), criador:usuarios!criado_por(nome)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const pendentes = transferencias.filter(t => t.status === 'AWAITING_ACCEPT' || t.status === 'ACCEPTED');

  const handleAceitar = async (id: string) => {
    if (!usuario) return;
    setActionLoading(id);
    try { await aceitarTransferencia(id, usuario.id); } catch (err: any) { alert(err?.message || 'Erro'); }
    setActionLoading(null);
  };

  const handleDespachar = async (id: string) => {
    if (!usuario) return;
    setActionLoading(id);
    try { await despacharTransferencia(id, usuario.id); } catch (err: any) { alert(err?.message || 'Erro'); }
    setActionLoading(null);
  };

  const statusLabel: Record<string, string> = {
    AWAITING_ACCEPT: 'Aguardando Aceite',
    ACCEPTED: 'Aceita',
    IN_TRANSIT: 'Em Trânsito',
    DELIVERED: 'Entregue',
    DIVERGENCE: 'Divergência',
  };

  const statusBadge: Record<string, 'warning' | 'info' | 'success' | 'error'> = {
    AWAITING_ACCEPT: 'warning',
    ACCEPTED: 'info',
    IN_TRANSIT: 'info',
    DELIVERED: 'success',
    DIVERGENCE: 'error',
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-yellow-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aceites Pendentes</h1>
          <p className="text-sm text-gray-500">Transferências aguardando ação</p>
        </div>
      </div>

      {pendentes.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhuma transferência pendente</p>
        </div>
      )}

      <div className="space-y-3">
        {pendentes.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <Badge variant={statusBadge[t.status]}>{statusLabel[t.status]}</Badge>
              <span className="text-xs text-gray-400">{new Date(t.created_at).toLocaleString('pt-BR')}</span>
            </div>
            <p className="font-semibold text-gray-900">{t.origem?.nome} → {t.destino?.nome}</p>
            <p className="text-sm text-gray-500 mt-1">Tipo: {t.tipo === 'STORE_STORE' ? 'Loja → Loja' : 'Indústria → Loja'} • Por: {t.criador?.nome}</p>

            <div className="flex gap-2 mt-3">
              {t.status === 'AWAITING_ACCEPT' && (
                <Button variant="primary" size="sm" onClick={() => handleAceitar(t.id)} disabled={actionLoading === t.id}>
                  {actionLoading === t.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                  Aceitar
                </Button>
              )}
              {t.status === 'ACCEPTED' && (
                <Button variant="primary" size="sm" onClick={() => handleDespachar(t.id)} disabled={actionLoading === t.id}>
                  {actionLoading === t.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Truck className="w-3 h-3 mr-1" />}
                  Despachar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
