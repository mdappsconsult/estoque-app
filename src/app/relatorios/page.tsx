'use client';

import { useState, useEffect } from 'react';
import { FileText, Loader2, Download } from 'lucide-react';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/lib/supabase';
import { Local } from '@/types/database';

type Relatorio = 'movimento' | 'consumo' | 'transferencias' | 'estoque_loja' | 'perdas';

const RELATORIOS: { value: Relatorio; label: string }[] = [
  { value: 'movimento', label: 'Movimento Diário por Loja' },
  { value: 'consumo', label: 'Consumo Médio por Produto' },
  { value: 'transferencias', label: 'Transferências (Enviado x Recebido)' },
  { value: 'estoque_loja', label: 'Estoque Atual por Loja' },
  { value: 'perdas', label: 'Perdas por Loja/Produto' },
];

interface ReportRow { label: string; values: Record<string, string | number> }

export default function RelatoriosPage() {
  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const [tipo, setTipo] = useState<Relatorio>('movimento');
  const [localId, setLocalId] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [colunas, setColunas] = useState<string[]>([]);

  const gerar = async () => {
    setLoading(true);
    setRows([]);
    try {
      const hoje = new Date().toISOString().slice(0, 10);

      if (tipo === 'movimento') {
        // Entrou = itens com created_at hoje no local (via auditoria RECEBER_TRANSFERENCIA)
        // Saiu consumo = baixas hoje
        // Saiu descarte = perdas hoje
        const { data: baixas } = await supabase.from('baixas').select('*, item:itens(produto:produtos(nome))').gte('created_at', hoje);
        const { data: perdasData } = await supabase.from('perdas').select('*, item:itens(produto:produtos(nome))').gte('created_at', hoje);
        
        setColunas(['Baixas (consumo)', 'Perdas (descarte)']);
        setRows([
          { label: 'Hoje', values: { 'Baixas (consumo)': baixas?.length || 0, 'Perdas (descarte)': perdasData?.length || 0 } },
        ]);
      } else if (tipo === 'consumo') {
        const d7 = new Date(); d7.setDate(d7.getDate() - 7);
        const d14 = new Date(); d14.setDate(d14.getDate() - 14);
        const d30 = new Date(); d30.setDate(d30.getDate() - 30);

        const { data: baixas7 } = await supabase.from('baixas').select('item:itens(produto_id, produto:produtos(nome))').gte('created_at', d7.toISOString());
        
        // Agrupar por produto
        const map: Record<string, { nome: string; count: number }> = {};
        (baixas7 || []).forEach((b: any) => {
          const pid = b.item?.produto_id;
          const nome = b.item?.produto?.nome || '?';
          if (!pid) return;
          if (!map[pid]) map[pid] = { nome, count: 0 };
          map[pid].count++;
        });

        setColunas(['Baixas 7d', 'Média/dia']);
        setRows(Object.values(map).map(m => ({
          label: m.nome,
          values: { 'Baixas 7d': m.count, 'Média/dia': (m.count / 7).toFixed(1) },
        })));
      } else if (tipo === 'transferencias') {
        const { data: trans } = await supabase.from('transferencias').select('id, status, origem:locais!origem_id(nome), destino:locais!destino_id(nome), transferencia_itens(id, recebido)').order('created_at', { ascending: false }).limit(50);
        
        setColunas(['Origem', 'Destino', 'Enviados', 'Recebidos', 'Status']);
        setRows((trans || []).map((t: any) => ({
          label: `#${t.id.slice(0, 8)}`,
          values: {
            Origem: t.origem?.nome || '?',
            Destino: t.destino?.nome || '?',
            Enviados: t.transferencia_itens?.length || 0,
            Recebidos: t.transferencia_itens?.filter((ti: any) => ti.recebido).length || 0,
            Status: t.status,
          },
        })));
      } else if (tipo === 'estoque_loja') {
        const { data: itensData } = await supabase.from('itens').select('estado, local_atual_id, local_atual:locais!local_atual_id(nome)').eq('estado', 'EM_ESTOQUE');
        
        const map: Record<string, { nome: string; count: number }> = {};
        (itensData || []).forEach((i: any) => {
          const lid = i.local_atual_id || 'sem_local';
          if (!map[lid]) map[lid] = { nome: (i.local_atual as any)?.nome || 'Sem local', count: 0 };
          map[lid].count++;
        });

        setColunas(['Quantidade']);
        setRows(Object.values(map).map(m => ({ label: m.nome, values: { Quantidade: m.count } })));
      } else if (tipo === 'perdas') {
        const { data: perdasData } = await supabase.from('perdas').select('*, item:itens(produto:produtos(nome)), local:locais(nome)').order('created_at', { ascending: false }).limit(100);
        
        setColunas(['Produto', 'Local', 'Motivo', 'Data']);
        setRows((perdasData || []).map((p: any) => ({
          label: `#${p.id.slice(0, 8)}`,
          values: {
            Produto: p.item?.produto?.nome || '?',
            Local: p.local?.nome || '?',
            Motivo: p.motivo,
            Data: new Date(p.created_at).toLocaleDateString('pt-BR'),
          },
        })));
      }
    } catch (err: any) {
      alert(err?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { gerar(); }, [tipo]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center"><FileText className="w-5 h-5 text-indigo-600" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <Select label="Tipo de Relatório" options={RELATORIOS} value={tipo} onChange={(e) => setTipo(e.target.value as Relatorio)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Item</th>
                {colunas.map(c => <th key={c} className="text-left px-4 py-3 text-sm font-medium text-gray-500">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.label}</td>
                  {colunas.map(c => <td key={c} className="px-4 py-3 text-sm text-gray-600">{r.values[c]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="text-center py-12 text-gray-400"><p>Sem dados para este relatório</p></div>
          )}
        </div>
      )}
    </div>
  );
}
