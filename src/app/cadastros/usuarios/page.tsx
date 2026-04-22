'use client';

import { useState } from 'react';
import { Users, Plus, Edit2, Trash2, Loader2, Phone } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { createUsuario, updateUsuario, deleteUsuario } from '@/lib/services/usuarios';
import { Local, Usuario, UsuarioInsert } from '@/types/database';
import { errMessage } from '@/lib/errMessage';
import { useAuth } from '@/hooks/useAuth';

const PERFIS = [
  { value: 'ADMIN_MASTER', label: 'Admin Master' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'OPERATOR_WAREHOUSE', label: 'Operador Indústria' },
  { value: 'OPERATOR_WAREHOUSE_DRIVER', label: 'Indústria + motorista' },
  { value: 'OPERATOR_STORE', label: 'Operador Loja' },
  { value: 'DRIVER', label: 'Motorista' },
];

const perfilBadge = (perfil: string) => {
  const map: Record<string, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
    ADMIN_MASTER: 'error',
    MANAGER: 'warning',
    OPERATOR_WAREHOUSE: 'info',
    OPERATOR_WAREHOUSE_DRIVER: 'info',
    OPERATOR_STORE: 'success',
    DRIVER: 'default',
  };
  return map[perfil] || 'default';
};

const perfilLabel = (perfil: string) => PERFIS.find(p => p.value === perfil)?.label || perfil;

function idsLocaisPermitidosParaPerfil(
  perfil: Usuario['perfil'],
  lista: Local[]
): Set<string> {
  if (perfil === 'OPERATOR_STORE') {
    return new Set(lista.filter((l) => l.tipo === 'STORE').map((l) => l.id));
  }
  if (perfil === 'OPERATOR_WAREHOUSE' || perfil === 'OPERATOR_WAREHOUSE_DRIVER') {
    return new Set(lista.filter((l) => l.tipo === 'WAREHOUSE').map((l) => l.id));
  }
  return new Set(lista.map((l) => l.id));
}

type UsuarioListaRow = Usuario & {
  local_padrao?: { id: string; nome: string; tipo?: string } | null;
};

export default function UsuariosPage() {
  const { usuario: usuarioLogado } = useAuth();
  const { data: usuarios, loading } = useRealtimeQuery<UsuarioListaRow>({
    table: 'usuarios',
    select: '*, local_padrao:locais!local_padrao_id(id, nome)',
    orderBy: { column: 'nome', ascending: true },
  });

  const { data: locais } = useRealtimeQuery<Local>({
    table: 'locais',
    orderBy: { column: 'nome', ascending: true },
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    perfil: 'OPERATOR_STORE' as Usuario['perfil'],
    local_padrao_id: '',
    login_operacional: '',
    senha_operacional: '',
    removerCredencialLogin: false,
  });

  const openCreate = () => {
    setEditando(null);
    setForm({
      nome: '',
      telefone: '',
      perfil: 'OPERATOR_STORE',
      local_padrao_id: '',
      login_operacional: '',
      senha_operacional: '',
      removerCredencialLogin: false,
    });
    setModalOpen(true);
  };

  const openEdit = (u: UsuarioListaRow) => {
    setEditando(u);
    setForm({
      nome: u.nome,
      telefone: u.telefone,
      perfil: u.perfil,
      local_padrao_id: u.local_padrao_id || '',
      login_operacional: u.login_operacional || '',
      senha_operacional: '',
      removerCredencialLogin: false,
    });
    setModalOpen(true);
  };

  const sincronizarCredencialApi = async (usuarioId: string) => {
    if (!usuarioLogado?.id) {
      throw new Error('Sessão inválida. Entre novamente como administrador.');
    }
    if (form.removerCredencialLogin) {
      if (!confirm('Remover login e senha deste usuário no banco? Ele só poderá entrar se ainda existir credencial legada no sistema.')) {
        throw new Error('Cancelado');
      }
      const r = await fetch('/api/admin/credencial-operacional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuarioId,
          actorId: usuarioLogado.id,
          removerCredencial: true,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error || 'Falha ao remover login');
      return;
    }

    const loginT = form.login_operacional.trim();
    const senhaT = form.senha_operacional.trim();
    if (!loginT && !senhaT) return;

    if (loginT && !senhaT && !editando) {
      throw new Error('Para novo usuário, informe também a senha (mín. 6 caracteres).');
    }

    const r = await fetch('/api/admin/credencial-operacional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuarioId,
        actorId: usuarioLogado.id,
        loginOperacional: loginT || undefined,
        senhaNova: senhaT || undefined,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) throw new Error(j.error || 'Falha ao gravar login/senha');
  };

  const handleSave = async () => {
    if (form.perfil === 'OPERATOR_STORE' && !form.local_padrao_id.trim()) {
      alert('Operador de loja precisa ter uma loja de atuação selecionada.');
      return;
    }
    try {
      const payload = {
        nome: form.nome,
        telefone: form.telefone,
        perfil: form.perfil,
        local_padrao_id: form.local_padrao_id || null,
      };
      let usuarioId: string;
      if (editando) {
        await updateUsuario(editando.id, payload);
        usuarioId = editando.id;
      } else {
        const insert: UsuarioInsert = {
          nome: payload.nome,
          telefone: payload.telefone,
          perfil: payload.perfil,
          local_padrao_id: payload.local_padrao_id,
          status: 'ativo',
        };
        const criado = await createUsuario(insert);
        usuarioId = criado.id;
      }

      const precisaCred =
        form.removerCredencialLogin ||
        form.login_operacional.trim().length > 0 ||
        form.senha_operacional.trim().length > 0;
      if (precisaCred) {
        await sincronizarCredencialApi(usuarioId);
      }

      setModalOpen(false);
    } catch (err: unknown) {
      const msg = errMessage(err, 'Erro ao salvar');
      if (msg !== 'Cancelado') alert(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este usuário?')) return;
    try { await deleteUsuario(id); } catch { alert('Erro ao excluir'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;
  }

  const localLabel =
    form.perfil === 'OPERATOR_STORE'
      ? 'Loja de atuação'
      : form.perfil === 'OPERATOR_WAREHOUSE' || form.perfil === 'OPERATOR_WAREHOUSE_DRIVER'
        ? 'Indústria padrão'
        : 'Local padrão';

  const localOptions =
    form.perfil === 'OPERATOR_STORE'
      ? [
          { value: '', label: 'Selecione a loja…' },
          ...locais
            .filter((l) => l.tipo === 'STORE')
            .map((l) => ({ value: l.id, label: l.nome })),
        ]
      : form.perfil === 'OPERATOR_WAREHOUSE' || form.perfil === 'OPERATOR_WAREHOUSE_DRIVER'
        ? [
            { value: '', label: 'Nenhum' },
            ...locais
              .filter((l) => l.tipo === 'WAREHOUSE')
              .map((l) => ({ value: l.id, label: l.nome })),
          ]
        : [
            { value: '', label: 'Nenhum' },
            ...locais.map((l) => ({
              value: l.id,
              label: `${l.nome} (${l.tipo === 'WAREHOUSE' ? 'Indústria' : 'Loja'})`,
            })),
          ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        <Button variant="primary" onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Novo</Button>
      </div>

      <div className="space-y-3">
        {usuarios.map((u) => (
          <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{u.nome}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={perfilBadge(u.perfil)} size="sm">{perfilLabel(u.perfil)}</Badge>
                <span className="text-xs text-gray-400 flex items-center gap-1"><Phone className="w-3 h-3" />{u.telefone}</span>
                {u.login_operacional && (
                  <span className="text-xs text-emerald-700 font-mono">• login: {u.login_operacional}</span>
                )}
                {u.local_padrao && <span className="text-xs text-gray-400">• {u.local_padrao.nome}</span>}
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(u)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(u.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {usuarios.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum usuário cadastrado</p>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Usuário' : 'Novo Usuário'}>
        <div className="p-6 space-y-4">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <Input label="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(99) 99999-9999" required />
          <Select
            label="Perfil"
            options={PERFIS}
            value={form.perfil}
            onChange={(e) => {
              const perfil = e.target.value as Usuario['perfil'];
              const ids = idsLocaisPermitidosParaPerfil(perfil, locais);
              setForm((prev) => ({
                ...prev,
                perfil,
                local_padrao_id:
                  prev.local_padrao_id && ids.has(prev.local_padrao_id) ? prev.local_padrao_id : '',
              }));
            }}
          />
          <Select
            label={localLabel}
            required={form.perfil === 'OPERATOR_STORE'}
            options={localOptions}
            value={form.local_padrao_id}
            onChange={(e) => setForm({ ...form, local_padrao_id: e.target.value })}
          />
          {form.perfil === 'OPERATOR_STORE' && (
            <p className="text-xs text-gray-500 -mt-2">
              Obrigatório: recebimentos consideram só remessas destinadas a esta loja.
            </p>
          )}
          {(form.perfil === 'OPERATOR_WAREHOUSE' || form.perfil === 'OPERATOR_WAREHOUSE_DRIVER') && (
            <p className="text-xs text-gray-500 -mt-2">
              Recomendado para baixa, perdas e operações na indústria correta.
            </p>
          )}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-medium text-gray-800">Acesso ao app (login / senha)</p>
            <p className="text-xs text-gray-500">
              A senha é guardada com hash no banco (nunca em texto puro). Sem login cadastrado aqui, o usuário só
              entra se ainda existir credencial legada no deploy.
            </p>
            <Input
              label="Usuário (login)"
              value={form.login_operacional}
              onChange={(e) => setForm({ ...form, login_operacional: e.target.value.toLowerCase() })}
              placeholder="ex: luciene"
              autoComplete="off"
            />
            <Input
              label={editando ? 'Nova senha (opcional)' : 'Senha'}
              type="password"
              value={form.senha_operacional}
              onChange={(e) => setForm({ ...form, senha_operacional: e.target.value })}
              placeholder={editando ? 'Deixe vazio para manter a senha atual' : 'Mínimo 6 caracteres'}
              autoComplete="new-password"
            />
            {editando && (
              <label className="flex items-center gap-2 text-sm text-red-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.removerCredencialLogin}
                  onChange={(e) => setForm({ ...form, removerCredencialLogin: e.target.checked })}
                />
                Remover login e senha deste usuário no banco
              </label>
            )}
          </div>
          <Button
            variant="primary"
            className="w-full"
            onClick={handleSave}
            disabled={!form.nome || !form.telefone || (form.perfil === 'OPERATOR_STORE' && !form.local_padrao_id)}
          >
            {editando ? 'Salvar' : 'Criar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
