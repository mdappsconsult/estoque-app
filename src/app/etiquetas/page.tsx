'use client';

import { useState } from 'react';
import { QrCode, Loader2, Printer, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/lib/supabase';

interface EtiquetaRow {
  id: string;
  produto_id: string;
  data_producao: string;
  data_validade: string;
  lote: string | null;
  impressa: boolean;
  excluida: boolean;
  created_at: string;
  produto: { nome: string };
}

export default function EtiquetasPage() {
  const { data: etiquetas, loading } = useRealtimeQuery<EtiquetaRow>({
    table: 'etiquetas',
    select: '*, produto:produtos(nome)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const [filtro, setFiltro] = useState<'todas' | 'pendentes' | 'impressas'>('pendentes');

  const filtradas = etiquetas.filter(e => {
    if (e.excluida) return false;
    if (filtro === 'pendentes') return !e.impressa;
    if (filtro === 'impressas') return e.impressa;
    return true;
  });

  const marcarImpressa = async (ids: string[]) => {
    await supabase.from('etiquetas').update({ impressa: true }).in('id', ids);
  };

  const excluir = async (id: string) => {
    await supabase.from('etiquetas').update({ excluida: true }).eq('id', id);
  };

  const imprimirEtiqueta = (e: EtiquetaRow) => {
    const w = window.open('', '_blank', 'width=400,height=300');
    if (!w) return;
    w.document.write(`
      <html><head><title>Etiqueta</title><style>
        body{font-family:sans-serif;padding:20px;text-align:center}
        .nome{font-size:18px;font-weight:bold;margin-bottom:8px}
        .info{font-size:12px;color:#666;margin:4px 0}
      </style></head><body>
        <div class="nome">${e.produto?.nome || 'Produto'}</div>
        <div class="info">Validade: ${new Date(e.data_validade).toLocaleDateString('pt-BR')}</div>
        ${e.lote ? `<div class="info">Lote: ${e.lote}</div>` : ''}
        <div class="info">Gerada: ${new Date(e.created_at).toLocaleString('pt-BR')}</div>
        <div style="margin-top:12px;font-size:24px;letter-spacing:4px">▣ ${e.id.slice(0, 8)}</div>
        <script>window.print()</script>
      </body></html>
    `);
    marcarImpressa([e.id]);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Etiquetas</h1>
        {filtradas.filter(e => !e.impressa).length > 0 && (
          <Button variant="primary" onClick={() => {
            filtradas.filter(e => !e.impressa).forEach(e => imprimirEtiqueta(e));
          }}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir Pendentes
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {(['pendentes', 'impressas', 'todas'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filtro === f ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {f === 'pendentes' ? 'Pendentes' : f === 'impressas' ? 'Impressas' : 'Todas'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtradas.map(e => (
          <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{e.produto?.nome}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400">Val: {new Date(e.data_validade).toLocaleDateString('pt-BR')}</span>
                {e.lote && <span className="text-xs text-gray-400">Lote: {e.lote}</span>}
                <Badge variant={e.impressa ? 'success' : 'warning'} size="sm">{e.impressa ? 'Impressa' : 'Pendente'}</Badge>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => imprimirEtiqueta(e)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"><Printer className="w-4 h-4" /></button>
              <button onClick={() => excluir(e.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {filtradas.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <QrCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma etiqueta {filtro === 'pendentes' ? 'pendente' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}
