'use client';

import { useState, useCallback } from 'react';
import { Search, Edit2, Trash2, Snowflake, Thermometer, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import ProdutoModal from '@/components/produtos/ProdutoModal';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/lib/supabase';

interface ProdutoComGrupos {
  id: string;
  nome: string;
  medida: string | null;
  unidade_medida: string;
  marca: string | null;
  fornecedor: string | null;
  sif: string | null;
  validade_dias: number;
  validade_horas: number;
  validade_minutos: number;
  exibir_horario_etiqueta: boolean;
  contagem_do_dia: boolean;
  status: string;
  grupos: { id: string; nome: string; cor: string }[];
  conservacoes: { id: string; tipo: string; status: string | null; dias: number; horas: number; minutos: number }[];
}

export default function ProdutosPage() {
  const { data: produtosRaw, loading, refetch } = useRealtimeQuery<any>({
    table: 'produtos',
    select: '*',
    orderBy: { column: 'nome', ascending: true },
    transform: async (prods) => {
      const result = await Promise.all(
        prods.map(async (produto: any) => {
          const { data: gruposData } = await supabase
            .from('produto_grupos')
            .select('grupo_id, grupos(id, nome, cor)')
            .eq('produto_id', produto.id);
          const { data: conservacoesData } = await supabase
            .from('conservacoes')
            .select('*')
            .eq('produto_id', produto.id);
          return {
            ...produto,
            grupos: (gruposData || []).map((pg: any) => pg.grupos),
            conservacoes: conservacoesData || [],
          };
        })
      );
      return result;
    },
  });

  const produtos = produtosRaw as ProdutoComGrupos[];

  const [searchTerm, setSearchTerm] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<ProdutoComGrupos | null>(null);

  const produtosFiltrados = produtos.filter(produto =>
    produto.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      } catch (error) {
        console.error('Erro ao excluir produto:', error);
        alert('Erro ao excluir produto');
      }
    }
  };

  const handleSalvarProduto = async (produtoData: any) => {
    try {
      if (produtoEditando) {
        const { error: updateError } = await supabase
          .from('produtos')
          .update({
            nome: produtoData.nome,
            medida: produtoData.medida,
            unidade_medida: produtoData.unidadeMedida,
            marca: produtoData.marca,
            sif: produtoData.sif,
            validade_dias: produtoData.validadeDias,
            validade_horas: produtoData.validadeHoras,
            validade_minutos: produtoData.validadeMinutos,
            exibir_horario_etiqueta: produtoData.exibirHorarioEtiqueta,
            contagem_do_dia: produtoData.contagemDoDia,
          })
          .eq('id', produtoEditando.id);
        if (updateError) throw updateError;

        await supabase.from('produto_grupos').delete().eq('produto_id', produtoEditando.id);
        if (produtoData.grupoIds?.length > 0) {
          await supabase.from('produto_grupos').insert(
            produtoData.grupoIds.map((grupoId: string) => ({ produto_id: produtoEditando.id, grupo_id: grupoId }))
          );
        }

        await supabase.from('conservacoes').delete().eq('produto_id', produtoEditando.id);
        if (produtoData.conservacoes?.length > 0) {
          await supabase.from('conservacoes').insert(
            produtoData.conservacoes.map((c: any) => ({ produto_id: produtoEditando.id, tipo: c.tipo, status: c.status, dias: c.dias, horas: c.horas, minutos: c.minutos }))
          );
        }
      } else {
        const { data: novoProduto, error: insertError } = await supabase
          .from('produtos')
          .insert({
            nome: produtoData.nome,
            medida: produtoData.medida,
            unidade_medida: produtoData.unidadeMedida,
            marca: produtoData.marca,
            sif: produtoData.sif,
            validade_dias: produtoData.validadeDias,
            validade_horas: produtoData.validadeHoras,
            validade_minutos: produtoData.validadeMinutos,
            exibir_horario_etiqueta: produtoData.exibirHorarioEtiqueta,
            contagem_do_dia: produtoData.contagemDoDia,
          })
          .select()
          .single();
        if (insertError) throw insertError;

        if (produtoData.grupoIds?.length > 0) {
          await supabase.from('produto_grupos').insert(
            produtoData.grupoIds.map((grupoId: string) => ({ produto_id: novoProduto.id, grupo_id: grupoId }))
          );
        }
        if (produtoData.conservacoes?.length > 0) {
          await supabase.from('conservacoes').insert(
            produtoData.conservacoes.map((c: any) => ({ produto_id: novoProduto.id, tipo: c.tipo, status: c.status, dias: c.dias, horas: c.horas, minutos: c.minutos }))
          );
        }
        await supabase.from('estoque').insert({ produto_id: novoProduto.id, quantidade: 0 });
      }

      setModalOpen(false);
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      alert('Erro ao salvar produto');
    }
  };

  const getIconeConservacao = (produto: ProdutoComGrupos) => {
    const tipo = produto.conservacoes[0]?.tipo;
    if (tipo === 'congelado') return <Snowflake className="w-5 h-5 text-blue-500" />;
    return <Thermometer className="w-5 h-5 text-gray-500" />;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
        <Button variant="primary" onClick={handleCriarProduto}>Criar produto</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex gap-4">
          <div className="w-64">
            <Select
              options={[
                { value: 'todos', label: 'Produtos da Unidade' },
                { value: 'ativos', label: 'Produtos Ativos' },
                { value: 'inativos', label: 'Produtos Inativos' },
              ]}
              value={filtroUnidade}
              onChange={(e) => setFiltroUnidade(e.target.value)}
            />
          </div>
          <div className="flex-1 relative">
            <Input placeholder="Buscar produto pelo nome" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Produto</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Grupos</th>
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
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-gray-500">Grupos</span>
                  <p className="font-semibold text-gray-900">{produto.grupos.map(g => g.nome).join(', ') || '-'}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-gray-500">Validades</span>
                  <div className="mt-1">{getIconeConservacao(produto)}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleEditarProduto(produto)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Edit2 className="w-5 h-5" /></button>
                    <button onClick={() => handleExcluirProduto(produto.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {produtosFiltrados.length === 0 && (
          <div className="text-center py-12"><p className="text-gray-500">Nenhum produto encontrado.</p></div>
        )}
      </div>

      <ProdutoModal isOpen={modalOpen} onClose={() => setModalOpen(false)} produto={produtoEditando} onSave={handleSalvarProduto} />
    </div>
  );
}
