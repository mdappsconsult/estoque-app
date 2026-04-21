'use client';

import { useMemo, useState } from 'react';
import { ChefHat, Loader2, Plus, Trash2, Edit2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';
import { idsFamiliasInsumoProducao } from '@/lib/producao-insumos-familia';
import {
  gramasPorDoseProduto,
  novoKeyLinhaInsumo,
  previewGramasInsumo,
  produtoUsaMassaInsumo,
} from '@/lib/services/producao-receitas';
import type { Familia, Produto, ProducaoReceita } from '@/types/database';

type LinhaEdicao = {
  key: string;
  produto_id: string;
  qtd_qr: string;
  massa_valor: string;
};

function novaLinhaEdicao(): LinhaEdicao {
  return { key: novoKeyLinhaInsumo(), produto_id: '', qtd_qr: '', massa_valor: '' };
}

export default function ReceitasProducaoPage() {
  const { usuario } = useAuth();
  const podeExcluir = usuario?.perfil === 'ADMIN_MASTER';

  const { data: produtos, loading: loadingProdutos } = useRealtimeQuery<Produto>({
    table: 'produtos',
    select:
      'id, nome, status, familia_id, origem, producao_consumo_por_massa, producao_gramas_por_embalagem, producao_gramas_por_dose',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: familias, loading: loadingFamilias } = useRealtimeQuery<Familia>({
    table: 'familias',
    select: 'id, nome',
    orderBy: { column: 'nome', ascending: true },
  });
  const {
    data: receitas,
    loading: loadingReceitas,
    error: receitasError,
    refetch,
  } = useRealtimeQuery<ProducaoReceita>({
    table: 'producao_receitas',
    orderBy: { column: 'nome', ascending: true },
  });

  const insumoFamiliaIds = useMemo(() => idsFamiliasInsumoProducao(familias), [familias]);
  const produtosInsumo = useMemo(
    () =>
      produtos.filter(
        (p) =>
          p.status === 'ativo' &&
          Boolean(p.familia_id) &&
          insumoFamiliaIds.has(p.familia_id as string)
      ),
    [produtos, insumoFamiliaIds]
  );
  const produtosProducao = useMemo(
    () =>
      produtos.filter((p) => !p.origem || p.origem === 'PRODUCAO' || p.origem === 'AMBOS'),
    [produtos]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<ProducaoReceita | null>(null);
  const [nome, setNome] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [produtoAcabadoId, setProdutoAcabadoId] = useState('');
  const [linhas, setLinhas] = useState<LinhaEdicao[]>([novaLinhaEdicao()]);
  const [saving, setSaving] = useState(false);
  /** Ao abrir receita existente: carrega itens do Supabase antes de editar. */
  const [editModalLoading, setEditModalLoading] = useState(false);

  const loading = loadingProdutos || loadingFamilias || loadingReceitas;

  const nomeAcabado = (id: string | null) => {
    if (!id) return '—';
    return produtos.find((p) => p.id === id)?.nome ?? id.slice(0, 8);
  };

  const fecharModal = () => {
    setModalOpen(false);
    setEditModalLoading(false);
  };

  const abrirNova = () => {
    setEditando(null);
    setEditModalLoading(false);
    setNome('');
    setAtivo(true);
    setProdutoAcabadoId('');
    setLinhas([novaLinhaEdicao()]);
    setModalOpen(true);
  };

  const abrirEdicao = async (rec: ProducaoReceita) => {
    setEditando(rec);
    setNome(rec.nome);
    setAtivo(rec.ativo);
    setProdutoAcabadoId(rec.produto_acabado_id ?? '');
    setLinhas([novaLinhaEdicao()]);
    setModalOpen(true);
    setEditModalLoading(true);
    const { data, error } = await supabase
      .from('producao_receita_itens')
      .select('*')
      .eq('receita_id', rec.id)
      .order('ordem', { ascending: true });
    setEditModalLoading(false);
    if (error) {
      alert(errMessage(error, 'Erro ao carregar itens'));
      setLinhas([novaLinhaEdicao()]);
      return;
    }
    const rows = data ?? [];
    if (rows.length === 0) {
      setLinhas([novaLinhaEdicao()]);
      return;
    }
    setLinhas(
      rows.map((row) => ({
        key: novoKeyLinhaInsumo(),
        produto_id: row.produto_id,
        qtd_qr: row.qtd_qr != null ? String(row.qtd_qr) : '',
        massa_valor: row.massa_valor?.trim() ?? '',
      }))
    );
  };

  const salvar = async () => {
    const nomeFinal = nome.trim();
    if (!nomeFinal) {
      alert('Informe o nome da receita');
      return;
    }

    const duplicada = receitas.find(
      (r) =>
        r.nome.trim().toLowerCase() === nomeFinal.toLowerCase() && r.id !== editando?.id
    );
    if (duplicada) {
      alert('Já existe uma receita com esse nome');
      return;
    }

    const linhasValidas: { produto_id: string; ordem: number; qtd_qr: number | null; massa_valor: string | null }[] =
      [];
    for (let i = 0; i < linhas.length; i++) {
      const L = linhas[i];
      if (!L.produto_id.trim()) continue;
      const p = produtos.find((x) => x.id === L.produto_id);
      if (!p) continue;
      const massa = produtoUsaMassaInsumo(p);
      if (massa) {
        const mv = L.massa_valor.trim();
        if (!mv) {
          alert(`Preencha doses ou kg para «${p.nome}» (linha ${i + 1}).`);
          return;
        }
        linhasValidas.push({
          produto_id: L.produto_id,
          ordem: linhasValidas.length,
          qtd_qr: null,
          massa_valor: mv,
        });
      } else {
        const q = Math.floor(Number(L.qtd_qr));
        if (!Number.isFinite(q) || q <= 0) {
          alert(`Preencha quantidade QR > 0 para «${p.nome}» (linha ${i + 1}).`);
          return;
        }
        linhasValidas.push({
          produto_id: L.produto_id,
          ordem: linhasValidas.length,
          qtd_qr: q,
          massa_valor: null,
        });
      }
    }

    if (linhasValidas.length === 0) {
      alert('Inclua ao menos um insumo com valores válidos.');
      return;
    }

    setSaving(true);
    try {
      const agora = new Date().toISOString();
      const acabado = produtoAcabadoId.trim() || null;
      let receitaId = editando?.id;

      if (editando) {
        const { error: e1 } = await supabase
          .from('producao_receitas')
          .update({
            nome: nomeFinal,
            ativo,
            produto_acabado_id: acabado,
            updated_at: agora,
          })
          .eq('id', editando.id);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from('producao_receita_itens').delete().eq('receita_id', editando.id);
        if (e2) throw e2;
      } else {
        const { data: inserted, error: eIns } = await supabase
          .from('producao_receitas')
          .insert({
            nome: nomeFinal,
            ativo,
            produto_acabado_id: acabado,
            updated_at: agora,
          })
          .select('id')
          .single();
        if (eIns) throw eIns;
        receitaId = inserted.id;
      }

      const { error: eIt } = await supabase.from('producao_receita_itens').insert(
        linhasValidas.map((l) => ({
          receita_id: receitaId!,
          produto_id: l.produto_id,
          ordem: l.ordem,
          qtd_qr: l.qtd_qr,
          massa_valor: l.massa_valor,
        }))
      );
      if (eIt) throw eIt;

      fecharModal();
      setEditando(null);
      await refetch();
    } catch (err: unknown) {
      alert(errMessage(err, 'Erro ao salvar receita'));
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (rec: ProducaoReceita) => {
    if (!podeExcluir) {
      alert('Somente ADMIN pode excluir receitas. Para ajustes, use Editar.');
      return;
    }
    if (!window.confirm(`Excluir a receita «${rec.nome}»?`)) return;
    try {
      const { error } = await supabase.from('producao_receitas').delete().eq('id', rec.id);
      if (error) throw error;
      await refetch();
    } catch (err: unknown) {
      alert(errMessage(err, 'Erro ao excluir'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-1 sm:px-0">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <ChefHat className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receitas de produção</h1>
          <p className="text-sm text-gray-500">
            Modelos de insumos usados na tela <strong>Produção</strong> (família Insumo Industria). Depois de salvar,
            use <strong>Editar</strong> na tabela para alterar nome, insumos ou valores.
          </p>
        </div>
      </div>

      {receitasError && (
        <div className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4 space-y-1">
          <p className="font-semibold">Não foi possível carregar receitas no Supabase.</p>
          <p className="text-xs whitespace-pre-wrap">{errMessage(receitasError, 'Erro desconhecido')}</p>
          {/relation .*producao_receitas.*does not exist/i.test(String(receitasError.message)) && (
            <p className="text-xs text-red-900/90">
              Provável causa: a migração ainda não foi aplicada neste projeto Supabase. Execute{' '}
              <code className="rounded bg-white/70 px-1">20260421100000_producao_receitas.sql</code>.
            </p>
          )}
        </div>
      )}

      {!loadingFamilias && insumoFamiliaIds.size === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Crie a categoria <strong>Insumo Industria</strong> em Cadastros → Categorias para vincular insumos.
        </p>
      )}

      <div className="mb-4">
        <Button type="button" onClick={abrirNova}>
          <Plus className="w-4 h-4 mr-1" />
          Nova receita
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Nome</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Acabado (opcional)</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Ativa</th>
              <th className="text-right px-3 py-2 font-semibold text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody>
            {receitas.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                <td className="px-3 py-2 font-medium text-gray-900">{r.nome}</td>
                <td className="px-3 py-2 text-gray-600">{nomeAcabado(r.produto_acabado_id)}</td>
                <td className="px-3 py-2">{r.ativo ? 'Sim' : 'Não'}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-blue-700 shrink-0"
                      onClick={() => void abrirEdicao(r)}
                      title="Editar receita"
                    >
                      <Edit2 className="w-4 h-4 sm:mr-1" />
                      <span className="text-sm">Editar</span>
                    </Button>
                    {podeExcluir && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-red-600 shrink-0"
                        onClick={() => void excluir(r)}
                        title="Excluir receita"
                      >
                        <Trash2 className="w-4 h-4 sm:mr-1" />
                        <span className="text-sm">Excluir</span>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {receitas.length === 0 && (
          <p className="px-3 py-6 text-center text-gray-500 text-sm">Nenhuma receita cadastrada.</p>
        )}
      </div>

      {/relation .*producao_receitas.*does not exist/i.test(String(receitasError?.message || '')) && (
        <p className="text-xs text-gray-500 mt-4">
          Migração necessária no Supabase:{' '}
          <code className="rounded bg-gray-100 px-1">20260421100000_producao_receitas.sql</code>
        </p>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && fecharModal()}
        title={editando ? 'Editar receita' : 'Nova receita'}
        size="xl"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            label="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            disabled={editModalLoading}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="rounded border-gray-300"
              disabled={editModalLoading}
            />
            Receita ativa (aparece na Produção)
          </label>
          <Select
            label="Produto acabado (opcional — para aviso na Produção)"
            options={[
              { value: '', label: 'Nenhum' },
              ...produtosProducao.map((p) => ({ value: p.id, label: p.nome })),
            ]}
            value={produtoAcabadoId}
            onChange={(e) => setProdutoAcabadoId(e.target.value)}
            disabled={editModalLoading}
          />

          <div className="border-t border-gray-100 pt-3 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Insumos</p>
            <p className="text-xs text-gray-500">
              Igual à tela <strong>Produção</strong>: produto com <strong>consumo por massa</strong> pede{' '}
              <strong>doses</strong> (se o cadastro tem g/dose &gt; 0) ou <strong>kg</strong> (se g/dose = 0: ex.{' '}
              <strong>60</strong> kg = 60 000 g). Produto só QR: informe <strong>quantidade de QR</strong>.
            </p>
            {editModalLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-gray-600 text-sm">
                <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                Carregando insumos salvos…
              </div>
            )}
            {!editModalLoading &&
              linhas.map((linha, index) => {
              const p = produtos.find((x) => x.id === linha.produto_id);
              const massa = produtoUsaMassaInsumo(p);
              const doseG = gramasPorDoseProduto(p);
              const gramasPrev = massa && p ? previewGramasInsumo(linha.massa_valor, p) : null;
              return (
                <div
                  key={linha.key}
                  className="flex flex-col sm:flex-row sm:items-end gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    <Select
                      label={index === 0 ? 'Insumo' : undefined}
                      options={[
                        { value: '', label: 'Produto...' },
                        ...produtosInsumo.map((x) => ({ value: x.id, label: x.nome })),
                      ]}
                      value={linha.produto_id}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLinhas((rows) =>
                          rows.map((r) =>
                            r.key === linha.key ? { ...r, produto_id: v, qtd_qr: '', massa_valor: '' } : r
                          )
                        );
                      }}
                    />
                  </div>
                  {linha.produto_id && (
                    <div className="w-full sm:w-40 space-y-1">
                      {massa && p ? (
                        <>
                          <Input
                            label={index === 0 ? (doseG > 0 ? 'Doses' : 'Kg') : undefined}
                            type="number"
                            min="0"
                            step={doseG > 0 ? '1' : 'any'}
                            placeholder={doseG > 0 ? '0' : 'ex.: 60'}
                            value={linha.massa_valor}
                            onChange={(e) =>
                              setLinhas((rows) =>
                                rows.map((r) =>
                                  r.key === linha.key ? { ...r, massa_valor: e.target.value } : r
                                )
                              )
                            }
                          />
                          {gramasPrev != null && gramasPrev > 0 && (
                            <p className="text-[11px] text-gray-600">
                              → <strong>{gramasPrev.toLocaleString('pt-BR')} g</strong> na produção
                            </p>
                          )}
                        </>
                      ) : (
                        <Input
                          label={index === 0 ? 'Qtd QR' : undefined}
                          type="number"
                          min={1}
                          step={1}
                          value={linha.qtd_qr}
                          onChange={(e) =>
                            setLinhas((rows) =>
                              rows.map((r) => (r.key === linha.key ? { ...r, qtd_qr: e.target.value } : r))
                            )
                          }
                        />
                      )}
                    </div>
                  )}
                  <div className="flex items-end pb-1 sm:pb-0">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() =>
                        setLinhas((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.key !== linha.key)))
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {!editModalLoading && (
            <Button
              type="button"
              variant="ghost"
              className="text-green-700"
              onClick={() => setLinhas((rows) => [...rows, novaLinhaEdicao()])}
            >
              <Plus className="w-4 h-4 mr-1" />
              Adicionar insumo
            </Button>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button type="button" variant="ghost" onClick={() => fecharModal()} disabled={saving || editModalLoading}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void salvar()} disabled={saving || editModalLoading}>
              {saving ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
