'use client';

import { useMemo, useState } from 'react';
import { Box, Edit2, Loader2, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/lib/supabase';

interface GrupoEmb {
  id: string;
  nome: string;
  cor: string;
}

interface ProdutoGrupo {
  produto_id: string;
  grupo_id: string;
}

export default function EmbalagensPage() {
  const { data: embalagens, loading, error: erroLista, refetch } = useRealtimeQuery<GrupoEmb>({
    table: 'grupos',
    select: 'id, nome, cor',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: produtoGrupos } = useRealtimeQuery<ProdutoGrupo>({
    table: 'produto_grupos',
    select: 'produto_id, grupo_id',
  });

  const usoPorGrupo = useMemo(() => {
    const mapa = new Map<string, number>();
    produtoGrupos.forEach((v) => {
      mapa.set(v.grupo_id, (mapa.get(v.grupo_id) || 0) + 1);
    });
    return mapa;
  }, [produtoGrupos]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<GrupoEmb | null>(null);
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);

  const abrirNovo = () => {
    setEditando(null);
    setNome('');
    setModalOpen(true);
  };

  const abrirEdicao = (item: GrupoEmb) => {
    setEditando(item);
    setNome(item.nome);
    setModalOpen(true);
  };

  const salvar = async () => {
    const nomeFinal = nome.trim();
    if (!nomeFinal) {
      alert('Informe o nome do tipo de embalagem');
      return;
    }
    const duplicada = embalagens.find(
      (item) => item.nome.trim().toLowerCase() === nomeFinal.toLowerCase() && item.id !== editando?.id
    );
    if (duplicada) {
      alert('Já existe um tipo de embalagem com esse nome');
      return;
    }

    setSaving(true);
    try {
      if (editando) {
        const { error } = await supabase.from('grupos').update({ nome: nomeFinal }).eq('id', editando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('grupos').insert({ nome: nomeFinal, cor: '#64748b' });
        if (error) throw error;
      }
      setModalOpen(false);
      setEditando(null);
      setNome('');
      await refetch();
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar tipo de embalagem');
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (item: GrupoEmb) => {
    const emUso = usoPorGrupo.get(item.id) || 0;
    if (emUso > 0) {
      alert('Não é possível excluir um tipo de embalagem vinculado a produtos.');
      return;
    }
    if (!window.confirm(`Excluir "${item.nome}"?`)) return;
    try {
      const { error } = await supabase.from('grupos').delete().eq('id', item.id);
      if (error) throw error;
      await refetch();
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir tipo de embalagem');
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
    <div className="max-w-3xl mx-auto">
      {erroLista && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Não foi possível carregar tipos de embalagem</p>
          <p className="mt-1 text-amber-800/90">{erroLista.message}</p>
          <p className="mt-2 text-xs text-amber-800/80">
            A lista vem da tabela <code className="rounded bg-amber-100/80 px-1">grupos</code>. Se estiver vazia após migrar, cadastre aqui ou rode a migration que copia de{' '}
            <code className="rounded bg-amber-100/80 px-1">tipos_embalagem</code>.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tipos de embalagem</h1>
          <p className="text-sm text-gray-500 mt-1">Caixa, balde, pote etc. — um tipo pode estar em vários produtos.</p>
        </div>
        <Button variant="primary" onClick={abrirNovo}>
          <Plus className="w-4 h-4 mr-2" /> Novo tipo
        </Button>
      </div>

      <div className="space-y-3">
        {embalagens.map((item) => {
          const emUso = usoPorGrupo.get(item.id) || 0;
          return (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Box className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{item.nome}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {emUso} produto(s) — exclusão bloqueada se em uso
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => abrirEdicao(item)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  title="Editar tipo de embalagem"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => void excluir(item)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  title="Excluir tipo de embalagem"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        {embalagens.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Box className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum tipo de embalagem cadastrado</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? 'Editar tipo de embalagem' : 'Novo tipo de embalagem'}
      >
        <div className="p-6 space-y-4">
          <Input
            label="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Ex: Caixa, Balde, Pote..."
          />
          <Button
            variant="primary"
            className="w-full"
            onClick={() => void salvar()}
            disabled={saving || !nome.trim()}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {editando ? 'Salvar' : 'Criar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
