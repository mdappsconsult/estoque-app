'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import Select from '@/components/ui/Select';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';
import { getRelatorioBaldes, type RelatorioBaldesRow } from '@/lib/services/relatorio-baldes';

type Option = { value: string; label: string };

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function diasAtrasIso(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: RelatorioBaldesRow[]): string {
  const header = [
    'Loja',
    'Produto',
    'Industria_em_estoque',
    'Loja_em_estoque',
    'Em_transito_para_loja',
    'Utilizados_periodo',
  ];
  const lines = rows.map((r) => [
    r.loja_nome,
    r.produto_nome,
    r.qtd_industria_em_estoque,
    r.qtd_loja_em_estoque,
    r.qtd_em_transferencia_para_loja,
    r.qtd_utilizados_periodo,
  ]);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [header, ...lines].map((cols) => cols.map(esc).join(',')).join('\n');
}

export default function RelatorioBaldesPage() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rows, setRows] = useState<RelatorioBaldesRow[]>([]);

  const [dataIni, setDataIni] = useState(() => diasAtrasIso(7));
  const [dataFim, setDataFim] = useState(() => hojeIso());

  const [apenasNomeBalde, setApenasNomeBalde] = useState(true);
  const [produtoId, setProdutoId] = useState<string>('');
  const [lojaId, setLojaId] = useState<string>('');
  const [localIndustriaId, setLocalIndustriaId] = useState<string>('');

  const [lojas, setLojas] = useState<Option[]>([{ value: '', label: 'Todas as lojas' }]);
  const [warehouses, setWarehouses] = useState<Option[]>([{ value: '', label: 'Todos os armazéns (WAREHOUSE)' }]);
  const [produtos, setProdutos] = useState<Option[]>([{ value: '', label: 'Todos os produtos' }]);

  const totals = useMemo(() => {
    let industria = 0;
    let loja = 0;
    let transito = 0;
    let usados = 0;
    const industriaPorProduto = new Map<string, number>();
    for (const r of rows) {
      if (!industriaPorProduto.has(r.produto_id)) {
        industriaPorProduto.set(r.produto_id, r.qtd_industria_em_estoque);
      }
      loja += r.qtd_loja_em_estoque;
      transito += r.qtd_em_transferencia_para_loja;
      usados += r.qtd_utilizados_periodo;
    }
    for (const v of industriaPorProduto.values()) industria += v;
    return { industria, loja, transito, usados };
  }, [rows]);

  useEffect(() => {
    const loadOptions = async () => {
      setErro(null);
      try {
        const [{ data: lojasData, error: e1 }, { data: whData, error: e2 }] = await Promise.all([
          supabase.from('locais').select('id, nome, tipo').eq('status', 'ativo').eq('tipo', 'STORE').order('nome'),
          supabase
            .from('locais')
            .select('id, nome, tipo')
            .eq('status', 'ativo')
            .eq('tipo', 'WAREHOUSE')
            .order('nome'),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;

        setLojas([
          { value: '', label: 'Todas as lojas' },
          ...(lojasData || []).map((l) => ({ value: l.id as string, label: String(l.nome || '') })),
        ]);
        const whOpts = [
          { value: '', label: 'Todos os armazéns (WAREHOUSE)' },
          ...(whData || []).map((l) => ({ value: l.id as string, label: String(l.nome || '') })),
        ];
        setWarehouses(whOpts);

        const maybeIndustria = whOpts.find((o) => /ind[úu]stria/i.test(o.label));
        if (maybeIndustria && !localIndustriaId) {
          setLocalIndustriaId(maybeIndustria.value);
        }
      } catch (err: unknown) {
        setErro(errMessage(err, 'Falha ao carregar opções'));
      }
    };
    void loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carregar opções 1x
  }, []);

  useEffect(() => {
    const loadProdutos = async () => {
      setErro(null);
      try {
        let q = supabase.from('produtos').select('id, nome, origem').eq('status', 'ativo').order('nome');
        q = q.in('origem', ['PRODUCAO', 'AMBOS']);
        if (apenasNomeBalde) q = q.ilike('nome', '%balde%');
        const { data, error } = await q;
        if (error) throw error;
        setProdutos([
          { value: '', label: 'Todos os produtos' },
          ...(data || []).map((p) => ({ value: p.id as string, label: String(p.nome || '') })),
        ]);
        if (produtoId && !(data || []).some((p) => p.id === produtoId)) {
          setProdutoId('');
        }
      } catch (err: unknown) {
        setErro(errMessage(err, 'Falha ao carregar produtos'));
      }
    };
    void loadProdutos();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ao trocar o filtro, refaz lista e pode limpar produto selecionado
  }, [apenasNomeBalde]);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await getRelatorioBaldes({
        dataIni,
        dataFim,
        lojaId: lojaId || null,
        produtoId: produtoId || null,
        apenasNomeBalde,
        localIndustriaId: localIndustriaId || null,
      });
      setRows(data);
    } catch (err: unknown) {
      setErro(errMessage(err, 'Erro ao gerar relatório'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch quando filtros mudam
  }, [dataIni, dataFim, lojaId, produtoId, apenasNomeBalde, localIndustriaId]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatório — Baldes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Itens produzidos na indústria (QR) enviados para lojas: saldo agora e utilizados (baixas) no período.
          </p>
        </div>

        <button
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          onClick={() => downloadCsv(`relatorio-baldes_${dataIni}_a_${dataFim}.csv`, toCsv(rows))}
          disabled={rows.length === 0}
          type="button"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data inicial</label>
            <input
              type="date"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              value={dataIni}
              onChange={(e) => setDataIni(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data final</label>
            <input
              type="date"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>

          <Select label="Loja" options={lojas} value={lojaId} onChange={(e) => setLojaId(e.target.value)} />
          <Select
            label="Indústria (armazém)"
            options={warehouses}
            value={localIndustriaId}
            onChange={(e) => setLocalIndustriaId(e.target.value)}
          />
          <Select
            label="Produto"
            options={produtos}
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
          />

          <div className="flex items-end">
            <label className="flex items-center gap-2 select-none text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={apenasNomeBalde}
                onChange={(e) => setApenasNomeBalde(e.target.checked)}
              />
              Somente produtos com “balde” no nome
            </label>
          </div>
        </div>

        {erro && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Na indústria (agora)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totals.industria}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Em trânsito (agora)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totals.transito}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Nas lojas (agora)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totals.loja}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Utilizados no período</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totals.usados}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Loja</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Produto</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Indústria (agora)</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Loja (agora)</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Trânsito (agora)</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Utilizados (período)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.loja_id}:${r.produto_id}:${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.loja_nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.produto_nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{r.qtd_industria_em_estoque}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{r.qtd_loja_em_estoque}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{r.qtd_em_transferencia_para_loja}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{r.qtd_utilizados_periodo}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!erro && rows.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p>Sem dados para os filtros selecionados.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

