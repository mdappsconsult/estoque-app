'use client';

import { useMemo, useState } from 'react';
import { Tags, Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/lib/supabase';

interface Familia {
  id: string;
  nome: string;
  cor: string;
}

interface ProdutoFamilia {
  id: string;
  familia_id: string | null;
}

export default function CategoriasPage() {
  const { data: categorias, loading, error: erroLista, refetch } = useRealtimeQuery<Familia>({
    table: 'familias',
    select: 'id, nome, cor',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: produtos } = useRealtimeQuery<ProdutoFamilia>({
    table: 'produtos',
    select: 'id, familia_id',
  });

  const totalPorFamilia = useMemo(() => {
    const mapa = new Map<string, number>();
    produtos.forEach((p) => {
      if (!p.familia_id) return;
      mapa.set(p.familia_id, (mapa.get(p.familia_id) || 0) + 1);
    });
    return mapa;
  }, [produtos]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Familia | null>(null);
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);

  const abrirNova = () => {
    setEditando(null);
    setNome('');
    setModalOpen(true);
  };

  const abrirEdicao = (categoria: Familia) => {
    setEditando(categoria);
    setNome(categoria.nome);
    setModalOpen(true);
  };

  const salvar = async () => {
    const nomeFinal = nome.trim();
    if (!nomeFinal) {
      alert('Informe o nome da família');
      return;
    }

    const duplicada = categorias.find(
      (c) =>
        c.nome.trim().toLowerCase() === nomeFinal.toLowerCase() &&
        c.id !== editando?.id
    );
    if (duplicada) {
      alert('Já existe uma família com esse nome');
      return;
    }

    setSaving(true);
    try {
      if (editando) {
        const { error } = await supabase.from('familias').update({ nome: nomeFinal }).eq('id', editando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('familias').insert({ nome: nomeFinal, cor: '#6B7280' });
        if (error) throw error;
      }
      setModalOpen(false);
      setEditando(null);
      setNome('');
      await refetch();
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar família');
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (categoria: Familia) => {
    const totalUso = totalPorFamilia.get(categoria.id) || 0;
    if (totalUso > 0) {
      alert('Não é possível excluir uma família que já está vinculada a produtos.');
      return;
    }
    if (!window.confirm(`Excluir a família "${categoria.nome}"?`)) return;

    try {
      const { error } = await supabase.from('familias').delete().eq('id', categoria.id);
      if (error) throw error;
      await refetch();
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir família');
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
          <p className="font-medium">Não foi possível carregar famílias</p>
          <p className="mt-1 text-amber-800/90">{erroLista.message}</p>
          <p className="mt-2 text-xs text-amber-800/80">
            Confira se a migration <code className="rounded bg-amber-100/80 px-1">20260402140000_familias_grupos_embalagem_canonica.sql</code>{' '}
            foi aplicada no Supabase deste ambiente (<code className="rounded bg-amber-100/80 px-1">supabase db push</code> ou SQL Editor).
          </p>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorias (família do produto)</h1>
          <p className="text-sm text-gray-500 mt-1">Famílias ficam na tabela dedicada; embalagem é outro cadastro.</p>
        </div>
        <Button variant="primary" onClick={abrirNova}>
          <Plus className="w-4 h-4 mr-2" /> Nova família
        </Button>
      </div>

      <div className="space-y-3">
        {categorias.map((categoria) => {
          const emUso = totalPorFamilia.get(categoria.id) || 0;
          return (
            <div
              key={categoria.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Tags className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{categoria.nome}</p>
                  <div className="mt-1">
                    <Badge size="sm" variant={emUso > 0 ? 'info' : 'default'}>
                      {emUso} produto(s)
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => abrirEdicao(categoria)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  title="Editar família"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => void excluir(categoria)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  title="Excluir família"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        {categorias.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Tags className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma família cadastrada</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? 'Editar família' : 'Nova família'}
      >
        <div className="p-6 space-y-4">
          <Input
            label="Nome da família"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Ex: Produtos alimentícios, Insumos, Limpeza..."
          />
          <Button
            variant="primary"
            className="w-full"
            onClick={() => void salvar()}
            disabled={saving || !nome.trim()}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {editando ? 'Salvar família' : 'Criar família'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
