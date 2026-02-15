'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { resolverDivergencia } from '@/lib/services/divergencias';

interface DivRow {
  id: string;
  tipo: string;
  resolvido: boolean;
  created_at: string;
  transferencia: { id: string; origem: { nome: string }; destino: { nome: string } };
  item: { id: string; token_qr: string; produto: { nome: string } };
  resolvedor: { nome: string } | null;
}

export default function DivergenciasPage() {
  const { usuario } = useAuth();
  const { data: divergencias, loading } = useRealtimeQuery<DivRow>({
    table: 'divergencias',
    select: '*, transferencia:transferencias(id, origem:locais!origem_id(nome), destino:locais!destino_id(nome)), item:itens(id, token_qr, produto:produtos(nome)), resolvedor:usuarios!resolvido_por(nome)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const [filtro, setFiltro] = useState<'abertas' | 'resolvidas' | 'todas'>('abertas');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const filtradas = divergencias.filter(d => {
    if (filtro === 'abertas') return !d.resolvido;
    if (filtro === 'resolvidas') return d.resolvido;
    return true;
  });

  const handleResolver = async (id: string) => {
    if (!usuario) return;
    setActionLoading(id);
    try { await resolverDivergencia(id, usuario.id); } catch (err: any) { alert(err?.message || 'Erro'); }
    setActionLoading(null);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-yellow-600" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Divergências</h1>
        <Badge variant="warning">{divergencias.filter(d => !d.resolvido).length} abertas</Badge>
      </div>

      <div className="flex gap-2 mb-4">
        {(['abertas', 'resolvidas', 'todas'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filtro === f ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtradas.map(d => (
          <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <Badge variant={d.tipo === 'FALTANTE' ? 'error' : 'warning'} size="sm">{d.tipo}</Badge>
              <span className="text-xs text-gray-400">{new Date(d.created_at).toLocaleString('pt-BR')}</span>
            </div>
            <p className="font-semibold text-gray-900">{d.item?.produto?.nome}</p>
            <p className="text-sm text-gray-500">QR: {d.item?.token_qr}</p>
            <p className="text-sm text-gray-400">{d.transferencia?.origem?.nome} → {d.transferencia?.destino?.nome}</p>
            {d.resolvido ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" /> Resolvida por {d.resolvedor?.nome}
              </div>
            ) : (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => handleResolver(d.id)} disabled={actionLoading === d.id}>
                {actionLoading === d.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Resolver
              </Button>
            )}
          </div>
        ))}
        {filtradas.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma divergência {filtro !== 'todas' ? filtro : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}
