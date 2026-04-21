'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FlaskConical, Plus, RotateCcw, Scale, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
  aplicarConsumoGramas,
  formatarGramasKg,
  gramasRestantesNoPacoteAberto,
} from '@/lib/producao-previa/aplicar-consumo-massa';
import {
  exemploInsumosPrevia,
  mapLancamentoDefaults,
  novoIdInsumoPrevia,
  type InsumoPrevia,
} from '@/lib/producao-previa/insumo-previa-types';

function estadoInicialPrevia(): { insumos: InsumoPrevia[]; lancamentoInputs: Record<string, string> } {
  const insumos = exemploInsumosPrevia();
  return { insumos, lancamentoInputs: mapLancamentoDefaults(insumos) };
}

type HistoricoLinha = {
  id: string;
  quando: string;
  trechos: { nome: string; massaG: number; embalagensMenos: number }[];
  ok: boolean;
  erro?: string;
};

export default function ProducaoPreviaSaldoParcialPage() {
  const init = useMemo(() => estadoInicialPrevia(), []);
  const [insumos, setInsumos] = useState<InsumoPrevia[]>(init.insumos);
  const [lancamentoInputs, setLancamentoInputs] = useState<Record<string, string>>(init.lancamentoInputs);
  const [historico, setHistorico] = useState<HistoricoLinha[]>([]);

  const simularLancamento = () => {
    if (insumos.length === 0) {
      alert('Cadastre pelo menos um insumo.');
      return;
    }

    const working = [...insumos];
    const trechos: HistoricoLinha['trechos'] = [];

    for (let i = 0; i < working.length; i++) {
      const ins = working[i];
      const raw = (lancamentoInputs[ins.id] ?? '0').trim();
      let massaG = 0;

      if (ins.gramasPorDose > 0) {
        const doses = Math.floor(Number(raw));
        if (!Number.isFinite(doses) || doses < 0) {
          alert(`«${ins.nome}»: doses inválidas.`);
          return;
        }
        massaG = doses * ins.gramasPorDose;
      } else {
        const kg = Number(raw.replace(',', '.'));
        if (!Number.isFinite(kg) || kg < 0) {
          alert(`«${ins.nome}»: kg inválidos.`);
          return;
        }
        massaG = kg * 1000;
      }

      if (massaG <= 0) continue;

      const r = aplicarConsumoGramas(ins, massaG);
      if (!r.ok) {
        setHistorico((h) => [
          {
            id: novoIdInsumoPrevia(),
            quando: new Date().toLocaleString('pt-BR'),
            trechos,
            ok: false,
            erro: `${ins.nome}: ${r.erro}`,
          },
          ...h,
        ]);
        alert(r.erro);
        return;
      }

      working[i] = { ...working[i], ...r.next };
      trechos.push({
        nome: ins.nome,
        massaG,
        embalagensMenos: r.embalagensConsumidasNestePasso,
      });
    }

    if (trechos.length === 0) {
      alert('Informe consumo em pelo menos um insumo (doses ou kg > 0).');
      return;
    }

    setInsumos(working);
    setHistorico((h) => [
      {
        id: novoIdInsumoPrevia(),
        quando: new Date().toLocaleString('pt-BR'),
        trechos,
        ok: true,
      },
      ...h,
    ]);
  };

  const resetDemo = () => {
    const next = exemploInsumosPrevia();
    setInsumos(next);
    setLancamentoInputs(mapLancamentoDefaults(next));
    setHistorico([]);
  };

  const adicionarInsumo = () => {
    const id = novoIdInsumoPrevia();
    setInsumos((list) => [
      ...list,
      {
        id,
        nome: `Insumo ${list.length + 1}`,
        embalagemGramas: 1000,
        embalagensFechadas: 1,
        saldoAcumuladoGramas: 0,
        gramasPorDose: 100,
      },
    ]);
    setLancamentoInputs((prev) => ({ ...prev, [id]: '0' }));
  };

  const removerInsumo = (id: string) => {
    if (!confirm('Remover este insumo da simulação?')) return;
    setInsumos((list) => list.filter((x) => x.id !== id));
    setLancamentoInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const atualizarInsumo = (id: string, patch: Partial<InsumoPrevia>) => {
    setInsumos((list) =>
      list.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, ...patch };
        if (patch.embalagemGramas != null && patch.embalagemGramas !== x.embalagemGramas) {
          next.saldoAcumuladoGramas = 0;
        }
        return next;
      })
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-1 sm:px-0 space-y-6">
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong>Protótipo — só simulação.</strong> Nada é gravado no Supabase. Cadastre insumos abaixo (gramas, doses,
        estoque) e simule lançamentos. Depois migramos à Produção real.
      </div>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
          <FlaskConical className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prévia: consumo por massa + saldo parcial</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cadastre cada produto com <strong>gramas por embalagem de compra</strong> e, se usar receita por dose,{' '}
            <strong>gramas por dose</strong>. Se deixar dose em <strong>0</strong>, o lançamento pede{' '}
            <strong>kg</strong> daquele insumo.
          </p>
          <p className="text-sm mt-2">
            <Link href="/producao" className="text-red-600 font-medium hover:underline">
              Voltar à Produção oficial
            </Link>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h2 className="font-semibold text-gray-900">Cadastro de insumos (demo)</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={adicionarInsumo}>
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = exemploInsumosPrevia();
                setInsumos(next);
                setLancamentoInputs(mapLancamentoDefaults(next));
              }}
            >
              Carregar exemplo
            </Button>
          </div>
        </div>

        {insumos.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum insumo. Use «Adicionar» ou «Carregar exemplo».</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">Nome</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">Embalagem (g)</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">G/dose (0 = kg)</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">Estoque (un.)</th>
                  <th className="px-2 py-2 font-medium w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {insumos.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-2 py-2">
                      <Input
                        value={row.nome}
                        onChange={(e) => atualizarInsumo(row.id, { nome: e.target.value })}
                        className="min-w-[140px]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={1}
                        value={row.embalagemGramas}
                        onChange={(e) =>
                          atualizarInsumo(row.id, {
                            embalagemGramas: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                          })
                        }
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.gramasPorDose}
                        onChange={(e) =>
                          atualizarInsumo(row.id, {
                            gramasPorDose: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          })
                        }
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.embalagensFechadas}
                        onChange={(e) =>
                          atualizarInsumo(row.id, {
                            embalagensFechadas: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          })
                        }
                        className="w-20"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removerInsumo(row.id)}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                        aria-label="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">
          <strong>Embalagem (g):</strong> peso líquido da caixa/saco do fornecedor (ex.: 800 ou 25000).{' '}
          <strong>G/dose:</strong> gramas por dose na receita; <strong>0</strong> = na simulação você informa{' '}
          <strong>kg</strong> por lançamento.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {insumos.map((ins) => {
          const restanteNoPacote =
            ins.saldoAcumuladoGramas > 0 ? gramasRestantesNoPacoteAberto(ins) : null;
          return (
            <div key={ins.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-800 font-semibold mb-2">
                <Scale className="w-4 h-4 text-violet-500 shrink-0" />
                <span className="truncate">{ins.nome || '—'}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Embalagem: {formatarGramasKg(ins.embalagemGramas)}
                {ins.gramasPorDose > 0 ? ` · ${ins.gramasPorDose} g/dose` : ' · consumo por kg no lançamento'}
              </p>
              <p className="text-sm text-gray-700">
                Embalagens fechadas: <strong>{ins.embalagensFechadas}</strong>
              </p>
              {ins.saldoAcumuladoGramas > 0 && restanteNoPacote != null && (
                <p className="text-sm mt-2 rounded-lg bg-violet-50 border border-violet-100 px-2.5 py-2 text-violet-950">
                  <strong>Pacote em uso:</strong> já saíram{' '}
                  <strong>{formatarGramasKg(ins.saldoAcumuladoGramas)}</strong> deste pacote · ainda restam{' '}
                  <strong>{formatarGramasKg(restanteNoPacote)}</strong> antes de abrir o próximo.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-3">Simular lançamento de produção</h2>
        {insumos.length === 0 ? (
          <p className="text-sm text-gray-500">Cadastre insumos para habilitar o lançamento.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {insumos.map((ins) => (
              <div key={ins.id}>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {ins.nome || 'Insumo'}
                  {ins.gramasPorDose > 0 ? (
                    <> — doses (× {ins.gramasPorDose} g)</>
                  ) : (
                    <> — kg neste lote</>
                  )}
                </label>
                <Input
                  type="number"
                  min={0}
                  step={ins.gramasPorDose > 0 ? 1 : '0.001'}
                  value={lancamentoInputs[ins.id] ?? ''}
                  placeholder={ins.gramasPorDose > 0 ? '0' : '0'}
                  onChange={(e) =>
                    setLancamentoInputs((prev) => ({
                      ...prev,
                      [ins.id]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button type="button" onClick={simularLancamento} disabled={insumos.length === 0}>
            Aplicar lançamento
          </Button>
          <Button type="button" variant="outline" onClick={resetDemo}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset demo
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <h2 className="font-semibold text-gray-900 px-4 py-3 border-b border-gray-100">Histórico (recente primeiro)</h2>
        {historico.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Nenhum lançamento simulado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Consumo</th>
                  <th className="px-3 py-2 font-medium">Emb. −</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historico.map((row) => (
                  <tr key={row.id} className={row.ok ? '' : 'bg-red-50'}>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap align-top">{row.quando}</td>
                    <td className="px-3 py-2 align-top">
                      {row.trechos.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="space-y-0.5">
                          {row.trechos.map((t, i) => (
                            <li key={i}>
                              {t.nome}: {formatarGramasKg(t.massaG)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {row.trechos.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="space-y-0.5">
                          {row.trechos.map((t, i) => (
                            <li key={i}>
                              {t.nome}: −{t.embalagensMenos}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {row.ok ? (
                        <span className="text-green-700">OK</span>
                      ) : (
                        <span className="text-red-700">{row.erro}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
