'use client';

import { useState } from 'react';
import { MapPin, Plus, Edit2, Trash2, Loader2, Warehouse, Store } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { createLocal, updateLocal, deleteLocal } from '@/lib/services/locais';
import { Local } from '@/types/database';

export default function LocaisPage() {
  const { data: locais, loading } = useRealtimeQuery<Local>({
    table: 'locais',
    orderBy: { column: 'nome', ascending: true },
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Local | null>(null);
  const [form, setForm] = useState({ nome: '', tipo: 'WAREHOUSE' as 'WAREHOUSE' | 'STORE', endereco: '' });

  const openCreate = () => {
    setEditando(null);
    setForm({ nome: '', tipo: 'WAREHOUSE', endereco: '' });
    setModalOpen(true);
  };

  const openEdit = (local: Local) => {
    setEditando(local);
    setForm({ nome: local.nome, tipo: local.tipo, endereco: local.endereco || '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editando) {
        await updateLocal(editando.id, { nome: form.nome, tipo: form.tipo, endereco: form.endereco || null });
      } else {
        await createLocal({ nome: form.nome, tipo: form.tipo, endereco: form.endereco || null });
      }
      setModalOpen(false);
    } catch (err) {
      alert('Erro ao salvar local');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este local?')) return;
    try {
      await deleteLocal(id);
    } catch {
      alert('Erro ao excluir');
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Locais</h1>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Novo Local
        </Button>
      </div>

      <div className="space-y-3">
        {locais.map((local) => (
          <div key={local.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${local.tipo === 'WAREHOUSE' ? 'bg-blue-100' : 'bg-green-100'}`}>
                {local.tipo === 'WAREHOUSE' ? <Warehouse className="w-5 h-5 text-blue-600" /> : <Store className="w-5 h-5 text-green-600" />}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{local.nome}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant={local.tipo === 'WAREHOUSE' ? 'info' : 'success'} size="sm">
                    {local.tipo === 'WAREHOUSE' ? 'Indústria' : 'Loja'}
                  </Badge>
                  {local.endereco && <span className="text-xs text-gray-400">{local.endereco}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(local)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(local.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {locais.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum local cadastrado</p>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Local' : 'Novo Local'}>
        <div className="p-6 space-y-4">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <Select
            label="Tipo"
            options={[
              { value: 'WAREHOUSE', label: 'Indústria / Estoque' },
              { value: 'STORE', label: 'Loja' },
            ]}
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as 'WAREHOUSE' | 'STORE' })}
          />
          <Input label="Endereço" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          <Button variant="primary" className="w-full" onClick={handleSave} disabled={!form.nome}>
            {editando ? 'Salvar' : 'Criar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
