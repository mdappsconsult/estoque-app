'use client';

import { useState, useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import Select from '@/components/ui/Select';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';

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
  const [tipo, setTipo] = useState<Relatorio>('movimento');
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
        type Baixa7Row = { item?: { produto_id?: string; produto?: { nome?: string } | { nome?: string }[] | null } | null };
        const normItemBaixa = (row: Baixa7Row) => {
          const it = row.item;
          if (it == null) return { produto_id: undefined as string | undefined, nome: '?' };
          const inner = Array.isArray(it) ? it[0] : it;
          const pid = inner?.produto_id;
          const p = inner?.produto;
          const prod = p == null ? null : Array.isArray(p) ? p[0] : p;
          const nome = prod?.nome || '?';
          return { produto_id: pid, nome };
        };
        ((baixas7 || []) as unknown as Baixa7Row[]).forEach((b) => {
          const { produto_id: pid, nome } = normItemBaixa(b);
          if (!pid) return;
          if (!map[pid]) map[pid] = { nome: nome || '?', count: 0 };
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
        type NomeRow = { nome?: string } | { nome?: string }[] | null | undefined;
        type TransRelRow = {
          id: string;
          status: string;
          origem?: NomeRow;
          destino?: NomeRow;
          transferencia_itens?: { recebido?: boolean }[] | null;
        };
        const nomeJoin = (v: NomeRow) => {
          if (v == null) return '?';
          const o = Array.isArray(v) ? v[0] : v;
          return (o && typeof o === 'object' && 'nome' in o && typeof o.nome === 'string' ? o.nome : null) || '?';
        };
        setRows(((trans || []) as unknown as TransRelRow[]).map((t) => {
          const ti = (t.transferencia_itens ?? []) as { recebido?: boolean }[];
          return {
            label: `#${t.id.slice(0, 8)}`,
            values: {
              Origem: nomeJoin(t.origem),
              Destino: nomeJoin(t.destino),
              Enviados: ti.length,
              Recebidos: ti.filter((x) => x.recebido).length,
              Status: t.status,
            },
          };
        }));
      } else if (tipo === 'estoque_loja') {
        const { data: itensData } = await supabase.from('itens').select('estado, local_atual_id, local_atual:locais!local_atual_id(nome)').eq('estado', 'EM_ESTOQUE');
        
        const map: Record<string, { nome: string; count: number }> = {};
        type ItemLojaRow = {
          local_atual_id?: string | null;
          local_atual?: { nome?: string } | { nome?: string }[] | null;
        };
        const nomeLocal = (la: ItemLojaRow['local_atual']) => {
          if (la == null) return 'Sem local';
          const o = Array.isArray(la) ? la[0] : la;
          return o?.nome || 'Sem local';
        };
        ((itensData || []) as unknown as ItemLojaRow[]).forEach((i) => {
          const lid = i.local_atual_id || 'sem_local';
          if (!map[lid]) map[lid] = { nome: nomeLocal(i.local_atual), count: 0 };
          map[lid].count++;
        });

        setColunas(['Quantidade']);
        setRows(Object.values(map).map(m => ({ label: m.nome, values: { Quantidade: m.count } })));
      } else if (tipo === 'perdas') {
        const { data: perdasData } = await supabase.from('perdas').select('*, item:itens(produto:produtos(nome)), local:locais(nome)').order('created_at', { ascending: false }).limit(100);
        
        setColunas(['Produto', 'Local', 'Motivo', 'Data']);
        type PerdaRelRow = {
          id: string;
          created_at: string;
          motivo: string;
          item?: { produto?: { nome?: string } } | null;
          local?: { nome?: string } | null;
        };
        setRows((perdasData || []).map((p: PerdaRelRow) => ({
          label: `#${p.id.slice(0, 8)}`,
          values: {
            Produto: p.item?.produto?.nome || '?',
            Local: p.local?.nome || '?',
            Motivo: p.motivo,
            Data: new Date(p.created_at).toLocaleDateString('pt-BR'),
          },
        })));
      }
    } catch (err: unknown) {
      alert(errMessage(err, 'Erro'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void gerar();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch só quando o tipo de relatório muda
  }, [tipo]);

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
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[640px]">
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
