'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Edit2, Trash2, Snowflake, Thermometer, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import ProdutoModal, { type ProdutoModalSavePayload } from '@/components/produtos/ProdutoModal';
import {
  fetchProdutosCadastroLista,
  type ProdutoComGruposLista,
} from '@/lib/services/produtos-cadastro-lista';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';

/** Alias local — mesmo formato esperado pelo `ProdutoModal`. */
type ProdutoComGrupos = ProdutoComGruposLista;

/**
 * Inclui colunas de massa só quando o operador ativa o modo ou quando precisa desligar no banco.
 * Assim, projetos Supabase ainda sem `20260420140000_producao_consumo_massa.sql` continuam salvando
 * produtos que nunca tiveram consumo por massa (colunas ausentes não entram no PATCH).
 */
function patchColunasProducaoMassa(
  produtoData: ProdutoModalSavePayload,
  produtoEditando: ProdutoComGrupos | null
): Record<string, unknown> {
  if (produtoData.producaoConsumoPorMassa) {
    return {
      producao_consumo_por_massa: true,
      producao_gramas_por_embalagem: produtoData.producaoGramasPorEmbalagem,
      producao_gramas_por_dose: produtoData.producaoGramasPorDose ?? 0,
    };
  }
  if (produtoEditando?.producao_consumo_por_massa === true) {
    return {
      producao_consumo_por_massa: false,
      producao_gramas_por_embalagem: null,
      producao_gramas_por_dose: null,
    };
  }
  return {};
}

const LABEL_ORIGEM: Record<string, string> = {
  COMPRA: 'Compra',
  PRODUCAO: 'Produção',
  AMBOS: 'Ambos',
};

const REALTIME_DEBOUNCE_MS = 350;

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<ProdutoComGrupos[]>([]);
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [recarregandoSilencioso, setRecarregandoSilencioso] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const primeiraCargaOk = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true && primeiraCargaOk.current;
    if (!silent) {
      if (!primeiraCargaOk.current) setLoadingInicial(true);
      else setRecarregandoSilencioso(true);
    }
    setErroLista(null);
    try {
      const { produtos: lista, error } = await fetchProdutosCadastroLista();
      if (error) {
        setErroLista(error.message);
        if (!primeiraCargaOk.current) setProdutos([]);
      } else {
        setProdutos(lista);
        primeiraCargaOk.current = true;
      }
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : 'Erro ao carregar produtos');
      if (!primeiraCargaOk.current) setProdutos([]);
    } finally {
      setLoadingInicial(false);
      setRecarregandoSilencioso(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const agendar = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void carregar({ silent: true });
      }, REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel('produtos-cadastro-lista')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produto_grupos' }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conservacoes' }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'familias' }, agendar)
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [carregar]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState('todos');
  const [filtroOrigem, setFiltroOrigem] = useState<string>('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<ProdutoComGrupos | null>(null);
  const [editarUrlAplicado, setEditarUrlAplicado] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !produtos.length || editarUrlAplicado) return;
    const id = new URLSearchParams(window.location.search).get('editar');
    if (!id) return;
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    const t = window.setTimeout(() => {
      setProdutoEditando(p);
      setModalOpen(true);
      setEditarUrlAplicado(true);
      window.history.replaceState({}, '', '/cadastros/produtos');
    }, 0);
    return () => window.clearTimeout(t);
  }, [produtos, editarUrlAplicado]);

  const produtosFiltrados = produtos.filter((produto) => {
    if (!produto.nome.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filtroOrigem !== 'todos' && (produto.origem || 'AMBOS') !== filtroOrigem) return false;
    if (filtroUnidade === 'ativos' && produto.status !== 'ativo') return false;
    if (filtroUnidade === 'inativos' && produto.status !== 'inativo') return false;
    return true;
  });

  const handleCriarProduto = () => {
    setProdutoEditando(null);
    setModalOpen(true);
  };

  const handleEditarProduto = (produto: ProdutoComGrupos) => {
    setProdutoEditando(produto);
    setModalOpen(true);
  };

  const handleExcluirProduto = async (produtoId: string) => {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
      try {
        const { error } = await supabase.from('produtos').delete().eq('id', produtoId);
        if (error) throw error;
        await carregar({ silent: true });
      } catch (error) {
        console.error('Erro ao excluir produto:', error);
        alert('Erro ao excluir produto');
      }
    }
  };

  const handleSalvarProduto = async (produtoData: ProdutoModalSavePayload) => {
    try {
      if (produtoEditando) {
        const massa = patchColunasProducaoMassa(produtoData, produtoEditando);
        const { error: updateError } = await supabase
          .from('produtos')
          .update({
            nome: produtoData.nome,
            medida: produtoData.medida,
            unidade_medida: produtoData.unidadeMedida,
            marca: produtoData.marca,
            fornecedor: produtoData.fornecedor,
            sif: produtoData.sif,
            origem: produtoData.origem,
            estoque_minimo: produtoData.estoqueMinimo,
            custo_referencia: produtoData.custoReferencia,
            familia_id: produtoData.familiaId || null,
            validade_dias: produtoData.validadeDias,
            validade_horas: produtoData.validadeHoras,
            validade_minutos: produtoData.validadeMinutos,
            exibir_horario_etiqueta: produtoData.exibirHorarioEtiqueta,
            contagem_do_dia: produtoData.contagemDoDia,
            escopo_reposicao: produtoData.escopoReposicao ?? 'loja',
            updated_at: new Date().toISOString(),
            ...massa,
          })
          .eq('id', produtoEditando.id);
        if (updateError) throw updateError;

        const { error: delPgErr } = await supabase
          .from('produto_grupos')
          .delete()
          .eq('produto_id', produtoEditando.id);
        if (delPgErr) throw delPgErr;
        const embIds: string[] = produtoData.embalagemGrupoIds || [];
        if (embIds.length > 0) {
          const { error: insPgErr } = await supabase.from('produto_grupos').insert(
            embIds.map((grupoId: string) => ({ produto_id: produtoEditando.id, grupo_id: grupoId }))
          );
          if (insPgErr) throw insPgErr;
        }

        const { error: delConsErr } = await supabase
          .from('conservacoes')
          .delete()
          .eq('produto_id', produtoEditando.id);
        if (delConsErr) throw delConsErr;
        if (produtoData.conservacoes?.length > 0) {
          const { error: insConsErr } = await supabase.from('conservacoes').insert(
            produtoData.conservacoes.map((c) => ({
              produto_id: produtoEditando.id,
              tipo: c.tipo,
              status: c.status,
              dias: c.dias,
              horas: c.horas,
              minutos: c.minutos,
            }))
          );
          if (insConsErr) throw insConsErr;
        }
      } else {
        const massa = patchColunasProducaoMassa(produtoData, null);
        const { data: novoProduto, error: insertError } = await supabase
          .from('produtos')
          .insert({
            nome: produtoData.nome,
            medida: produtoData.medida,
            unidade_medida: produtoData.unidadeMedida,
            marca: produtoData.marca,
            fornecedor: produtoData.fornecedor,
            sif: produtoData.sif,
            origem: produtoData.origem,
            estoque_minimo: produtoData.estoqueMinimo,
            custo_referencia: produtoData.custoReferencia,
            familia_id: produtoData.familiaId || null,
            validade_dias: produtoData.validadeDias,
            validade_horas: produtoData.validadeHoras,
            validade_minutos: produtoData.validadeMinutos,
            exibir_horario_etiqueta: produtoData.exibirHorarioEtiqueta,
            contagem_do_dia: produtoData.contagemDoDia,
            escopo_reposicao: produtoData.escopoReposicao ?? 'loja',
            ...massa,
          })
          .select()
          .single();
        if (insertError) throw insertError;
        if (!novoProduto?.id) throw new Error('Resposta inválida ao criar produto.');

        const embNovos: string[] = produtoData.embalagemGrupoIds || [];
        if (embNovos.length > 0) {
          const { error: insPgErr } = await supabase.from('produto_grupos').insert(
            embNovos.map((grupoId: string) => ({ produto_id: novoProduto.id, grupo_id: grupoId }))
          );
          if (insPgErr) throw insPgErr;
        }
        if (produtoData.conservacoes?.length > 0) {
          const { error: insConsErr } = await supabase.from('conservacoes').insert(
            produtoData.conservacoes.map((c) => ({
              produto_id: novoProduto.id,
              tipo: c.tipo,
              status: c.status,
              dias: c.dias,
              horas: c.horas,
              minutos: c.minutos,
            }))
          );
          if (insConsErr) throw insConsErr;
        }
        const { error: estoqueErr } = await supabase
          .from('estoque')
          .insert({ produto_id: novoProduto.id, quantidade: 0 });
        if (estoqueErr) throw estoqueErr;
      }

      setModalOpen(false);
      await carregar({ silent: true });
    } catch (error) {
      const msg = errMessage(error, 'Erro ao salvar produto');
      console.error('Erro ao salvar produto:', msg, error);
      alert(msg);
    }
  };

  const getIconeConservacao = (produto: ProdutoComGrupos) => {
    const tipo = produto.conservacoes[0]?.tipo;
    if (tipo === 'congelado') return <Snowflake className="w-5 h-5 text-blue-500" />;
    return <Thermometer className="w-5 h-5 text-gray-500" />;
  };

  if (loadingInicial && !primeiraCargaOk.current) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
          {recarregandoSilencioso && (
            <Loader2 className="w-5 h-5 text-red-500 animate-spin shrink-0" aria-hidden />
          )}
        </div>
        <Button variant="primary" onClick={handleCriarProduto} className="w-full sm:w-auto">
          Criar produto
        </Button>
      </div>

      {erroLista && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex flex-wrap items-center justify-between gap-2">
          <span>{erroLista}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void carregar()}>
            Tentar de novo
          </Button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Cadastro de produto define os padrões. Para lançar compras do dia a dia (com validade e lote
          reais), use a tela <strong>Registrar Compra</strong>.
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="w-full sm:w-64">
            <Select
              options={[
                { value: 'todos', label: 'Todos (ativos e inativos)' },
                { value: 'ativos', label: 'Só ativos' },
                { value: 'inativos', label: 'Só inativos' },
              ]}
              value={filtroUnidade}
              onChange={(e) => setFiltroUnidade(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              label="Origem"
              options={[
                { value: 'todos', label: 'Todas as origens' },
                { value: 'COMPRA', label: 'Só compra' },
                { value: 'PRODUCAO', label: 'Só produção' },
                { value: 'AMBOS', label: 'Compra e produção' },
              ]}
              value={filtroOrigem}
              onChange={(e) => setFiltroOrigem(e.target.value)}
            />
          </div>
          <div className="w-full sm:flex-1 relative min-w-0">
            <Input
              placeholder="Buscar produto pelo nome"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Produto</th>
              <th className="text-left px-4 py-4 text-sm font-medium text-gray-500">Origem</th>
              <th className="text-left px-4 py-4 text-sm font-medium text-gray-500">Embalagem</th>
              <th className="text-right px-4 py-4 text-sm font-medium text-gray-500">Mín.</th>
              <th className="text-right px-4 py-4 text-sm font-medium text-gray-500">Ref. R$</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Família</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Validades</th>
              <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">Ações</th>
            </tr>
          </thead>
          <tbody>
            {produtosFiltrados.map((produto) => (
              <tr key={produto.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-6 py-4">
                  <span className="text-sm text-gray-500">Produto</span>
                  <p className="font-semibold text-gray-900">{produto.nome}</p>
                  {produto.status === 'inativo' && (
                    <span className="text-xs text-amber-700">Inativo</span>
                  )}
                </td>
                <td className="px-4 py-4 text-sm text-gray-700">
                  {LABEL_ORIGEM[produto.origem] || produto.origem}
                </td>
                <td className="px-4 py-4 text-sm text-gray-700">
                  {produto.grupos.map((g) => g.nome).join(', ') || '-'}
                </td>
                <td className="px-4 py-4 text-right text-sm tabular-nums text-gray-800">
                  {produto.estoque_minimo ?? 0}
                </td>
                <td className="px-4 py-4 text-right text-sm tabular-nums text-gray-800">
                  {produto.custo_referencia != null
                    ? Number(produto.custo_referencia).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '—'}
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-gray-500">Família</span>
                  <p className="font-semibold text-gray-900">{produto.familia?.nome || '-'}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-gray-500">Validades</span>
                  <div className="mt-1">{getIconeConservacao(produto)}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleEditarProduto(produto)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleExcluirProduto(produto.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {produtosFiltrados.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">Nenhum produto encontrado.</p>
          </div>
        )}
      </div>

      <ProdutoModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        produto={produtoEditando}
        onSave={handleSalvarProduto}
      />
    </div>
  );
}
