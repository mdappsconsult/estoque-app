'use client';

import { Loader2, Truck, CheckCircle, Play } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { aceitarViagem, iniciarViagem } from '@/lib/services/viagens';
import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';

interface ViagemRow {
  id: string;
  status: string;
  motorista_id: string | null;
  created_at: string;
  motorista?: { nome: string } | null;
}

interface TransRow {
  id: string;
  destino: { nome: string };
  status: string;
  transferencia_itens: { id: string }[];
}

export default function ViagemAceitePage() {
  const { usuario } = useAuth();
  const { data: viagens, loading } = useRealtimeQuery<ViagemRow>({
    table: 'viagens',
    select: '*, motorista:usuarios!motorista_id(nome)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const [transMap, setTransMap] = useState<Record<string, TransRow[]>>({});
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Buscar transferências de cada viagem
  useEffect(() => {
    const fetchTrans = async () => {
      const map: Record<string, TransRow[]> = {};
      for (const v of viagens) {
        const { data } = await supabase
          .from('transferencias')
          .select('id, status, destino:locais!destino_id(nome), transferencia_itens(id)')
          .eq('viagem_id', v.id);
        map[v.id] = (data || []) as any;
      }
      setTransMap(map);
    };
    if (viagens.length > 0) fetchTrans();
  }, [viagens]);

  const handleAceitar = async (viagemId: string) => {
    if (!usuario) return;
    setLoadingAction(viagemId);
    try { await aceitarViagem(viagemId, usuario.id); } catch (err: any) { alert(err?.message || 'Erro'); }
    setLoadingAction(null);
  };

  const handleIniciar = async (viagemId: string) => {
    if (!usuario) return;
    setLoadingAction(viagemId);
    try { await iniciarViagem(viagemId, usuario.id); } catch (err: any) { alert(err?.message || 'Erro'); }
    setLoadingAction(null);
  };

  const statusBadge = (s: string) => {
    const m: Record<string, 'warning' | 'info' | 'success' | 'default'> = { PENDING: 'warning', ACCEPTED: 'info', IN_TRANSIT: 'info', COMPLETED: 'success' };
    return m[s] || 'default';
  };
  const statusLabel = (s: string) => {
    const m: Record<string, string> = { PENDING: 'Pendente', ACCEPTED: 'Aceita', IN_TRANSIT: 'Em Trânsito', COMPLETED: 'Completa' };
    return m[s] || s;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  const viagensPendentes = viagens.filter(v => v.status === 'PENDING' || v.status === 'ACCEPTED');
  const viagensHist = viagens.filter(v => v.status === 'IN_TRANSIT' || v.status === 'COMPLETED');

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Truck className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Viagens / Aceite</h1>
          <p className="text-sm text-gray-500">Aceitar viagens e iniciar transporte</p>
        </div>
      </div>

      {viagensPendentes.length === 0 && <div className="text-center py-12 text-gray-400"><Truck className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhuma viagem pendente</p></div>}

      <div className="space-y-4">
        {viagensPendentes.map(v => {
          const trans = transMap[v.id] || [];
          const totalItens = trans.reduce((acc, t) => acc + (t.transferencia_itens?.length || 0), 0);
          return (
            <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">Viagem #{v.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-400">{new Date(v.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <Badge variant={statusBadge(v.status)}>{statusLabel(v.status)}</Badge>
              </div>
              {trans.length > 0 && (
                <div className="space-y-1 mb-3">
                  {trans.map(t => (
                    <div key={t.id} className="text-sm text-gray-600 flex items-center gap-2">
                      <span>→ {(t.destino as any)?.nome}</span>
                      <span className="text-xs text-gray-400">({t.transferencia_itens?.length || 0} itens)</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-sm text-gray-500 mb-3">{trans.length} destino(s) • {totalItens} itens total</p>
              {v.status === 'PENDING' && (
                <Button variant="primary" className="w-full" onClick={() => handleAceitar(v.id)} disabled={loadingAction === v.id}>
                  {loadingAction === v.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Aceitar Viagem
                </Button>
              )}
              {v.status === 'ACCEPTED' && v.motorista_id === usuario?.id && (
                <Button variant="primary" className="w-full" onClick={() => handleIniciar(v.id)} disabled={loadingAction === v.id}>
                  {loadingAction === v.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  Iniciar Viagem
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {viagensHist.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-700 mt-8 mb-4">Histórico</h2>
          <div className="space-y-2">
            {viagensHist.slice(0, 10).map(v => (
              <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Viagem #{v.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-400">{new Date(v.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <Badge variant={statusBadge(v.status)} size="sm">{statusLabel(v.status)}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
