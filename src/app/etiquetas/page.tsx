'use client';

import { useEffect, useState } from 'react';
import { QrCode, Loader2, Printer, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import {
  confirmarImpressao,
  FORMATO_CONFIG,
  FORMATO_IMPRESSAO_STORAGE_KEY,
  FormatoEtiqueta,
  imprimirEtiquetasEmJobUnico,
} from '@/lib/printing/label-print';

interface EtiquetaRow {
  id: string;
  produto_id: string;
  data_producao: string;
  data_validade: string;
  lote: string | null;
  impressa: boolean;
  excluida: boolean;
  created_at: string;
  produto: { nome: string; validade_dias?: number; validade_horas?: number; validade_minutos?: number };
  item?: { id: string; token_qr: string; token_short: string | null } | null;
}

interface GrupoEtiquetas {
  chave: string;
  lote: string;
  produtoNome: string;
  total: number;
  pendentes: number;
  impressas: number;
  etiquetas: EtiquetaRow[];
}

export default function EtiquetasPage() {
  const produtoTemValidade = (produto: EtiquetaRow['produto'] | undefined) =>
    Boolean(
      ((produto?.validade_dias || 0) > 0) ||
      ((produto?.validade_horas || 0) > 0) ||
      ((produto?.validade_minutos || 0) > 0)
    );

  const { usuario } = useAuth();
  const { data: etiquetas, loading } = useRealtimeQuery<EtiquetaRow>({
    table: 'etiquetas',
    select: '*, produto:produtos(nome, validade_dias, validade_horas, validade_minutos)',
    orderBy: { column: 'created_at', ascending: false },
    transform: async (rows) => {
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return rows;

      const { data: itens } = await supabase
        .from('itens')
        .select('id, token_qr, token_short')
        .in('id', ids);

      const itemMap = new Map((itens || []).map((item) => [item.id, item]));

      return rows.map((row) => ({
        ...row,
        item: itemMap.get(row.id) || null,
      }));
    },
  });

  const [filtro, setFiltro] = useState<'todas' | 'pendentes' | 'impressas'>('pendentes');
  const [formatoImpressao, setFormatoImpressao] = useState<FormatoEtiqueta>('60x60');
  const [printing, setPrinting] = useState(false);
  const [erroImpressao, setErroImpressao] = useState('');

  useEffect(() => {
    const salvo = window.localStorage.getItem(FORMATO_IMPRESSAO_STORAGE_KEY);
    if (salvo === '60x60' || salvo === '58x40' || salvo === '50x30') {
      setFormatoImpressao(salvo);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FORMATO_IMPRESSAO_STORAGE_KEY, formatoImpressao);
  }, [formatoImpressao]);

  const filtradas = etiquetas.filter(e => {
    if (e.excluida) return false;
    if (filtro === 'pendentes') return !e.impressa;
    if (filtro === 'impressas') return e.impressa;
    return true;
  });

  const grupos = filtradas.reduce<GrupoEtiquetas[]>((acc, etiqueta) => {
    const lote = etiqueta.lote || `SEM_LOTE_${etiqueta.id}`;
    const produtoNome = etiqueta.produto?.nome || 'Produto';
    const chave = `${lote}::${produtoNome}`;
    const existente = acc.find((grupo) => grupo.chave === chave);

    if (existente) {
      existente.etiquetas.push(etiqueta);
      existente.total += 1;
      if (etiqueta.impressa) {
        existente.impressas += 1;
      } else {
        existente.pendentes += 1;
      }
      return acc;
    }

    acc.push({
      chave,
      lote: etiqueta.lote || 'Sem lote',
      produtoNome,
      total: 1,
      pendentes: etiqueta.impressa ? 0 : 1,
      impressas: etiqueta.impressa ? 1 : 0,
      etiquetas: [etiqueta],
    });
    return acc;
  }, []);

  const marcarImpressa = async (ids: string[]) => {
    const { error } = await supabase.from('etiquetas').update({ impressa: true }).in('id', ids);
    if (error) throw error;
  };

  const excluir = async (id: string) => {
    await supabase.from('etiquetas').update({ excluida: true }).eq('id', id);
  };

  const imprimirLista = async (lista: EtiquetaRow[]) => {
    if (lista.length === 0) return;
    if (!confirmarImpressao(lista.length)) return;

    setPrinting(true);
    setErroImpressao('');

    try {
      const sucesso = imprimirEtiquetasEmJobUnico(
        lista.map((e) => ({
          id: e.id,
          produtoNome: e.produto?.nome || 'Produto',
          dataManipulacao: e.data_producao,
          dataValidade: produtoTemValidade(e.produto) ? e.data_validade : '',
          lote: e.lote || '-',
          tokenQr: e.item?.token_qr || e.id,
          tokenShort: e.item?.token_short || e.id.slice(0, 8).toUpperCase(),
          responsavel: usuario?.nome || 'OPERADOR',
        })),
        formatoImpressao
      );

      if (!sucesso) {
        throw new Error('Não foi possível abrir a janela de impressão. Libere pop-ups e tente novamente.');
      }

      await marcarImpressa(lista.map((e) => e.id));
    } catch (err: unknown) {
      setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir etiquetas');
    } finally {
      setPrinting(false);
    }
  };

  const imprimirEtiqueta = async (e: EtiquetaRow) => {
    await imprimirLista([e]);
  };

  const imprimirPendentes = async () => {
    const pendentes = filtradas.filter((e) => !e.impressa);
    await imprimirLista(pendentes);
  };

  const imprimirGrupo = async (grupo: GrupoEtiquetas) => {
    const pendentes = grupo.etiquetas.filter((etiqueta) => !etiqueta.impressa);
    await imprimirLista(pendentes);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Etiquetas</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <select
            value={formatoImpressao}
            onChange={(event) => setFormatoImpressao(event.target.value as FormatoEtiqueta)}
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            aria-label="Formato de impressão"
          >
            {(Object.keys(FORMATO_CONFIG) as FormatoEtiqueta[]).map((formato) => (
              <option key={formato} value={formato}>{FORMATO_CONFIG[formato].label}</option>
            ))}
          </select>
          {filtradas.filter(e => !e.impressa).length > 0 && (
            <Button variant="primary" onClick={imprimirPendentes} disabled={printing} className="w-full sm:w-auto">
              {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
              Imprimir Pendentes
            </Button>
          )}
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-500">
        Formato selecionado fica salvo como padrão neste dispositivo.
      </p>

      {erroImpressao && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erroImpressao}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
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

      <div className="space-y-3">
        {grupos.map((grupo) => (
          <div key={grupo.chave} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{grupo.produtoNome}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">Lote: {grupo.lote}</span>
                  <span className="text-xs text-gray-500">Total: {grupo.total}</span>
                  <Badge variant="warning" size="sm">Pendentes: {grupo.pendentes}</Badge>
                  <Badge variant="success" size="sm">Impressas: {grupo.impressas}</Badge>
                </div>
              </div>
              {grupo.pendentes > 0 && (
                <Button variant="primary" onClick={() => imprimirGrupo(grupo)} disabled={printing}>
                  {printing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                  Imprimir grupo ({grupo.pendentes})
                </Button>
              )}
            </div>

            <div className="mt-3 max-h-48 overflow-y-auto space-y-2">
              {grupo.etiquetas.map((e) => (
                <div key={e.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400">
                      Val:{' '}
                      {produtoTemValidade(e.produto)
                        ? new Date(e.data_validade).toLocaleDateString('pt-BR')
                        : 'Sem validade'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">Token: {e.item?.token_short || e.id.slice(0, 8).toUpperCase()}</span>
                    <Badge variant={e.impressa ? 'success' : 'warning'} size="sm">{e.impressa ? 'Impressa' : 'Pendente'}</Badge>
                  </div>
                  <div className="flex gap-1 self-end sm:self-auto">
                    <button aria-label="Imprimir etiqueta" onClick={async () => {
                      setErroImpressao('');
                      try {
                        await imprimirEtiqueta(e);
                      } catch (err: unknown) {
                        setErroImpressao(err instanceof Error ? err.message : 'Falha ao imprimir etiqueta');
                      }
                    }} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"><Printer className="w-4 h-4" /></button>
                    <button onClick={() => excluir(e.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
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
