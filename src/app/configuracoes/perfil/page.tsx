'use client';

import { useState, useEffect } from 'react';
import { Settings, Loader2, Save, LogOut, User } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { updateUsuario } from '@/lib/services/usuarios';
import { useRouter } from 'next/navigation';

const perfilLabel: Record<string, string> = {
  ADMIN_MASTER: 'Admin Master',
  MANAGER: 'Gerente',
  OPERATOR_WAREHOUSE: 'Operador Indústria',
  OPERATOR_STORE: 'Operador Loja',
  DRIVER: 'Motorista',
};

export default function PerfilPage() {
  const { usuario, logout } = useAuth();
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    if (usuario) setNome(usuario.nome);
  }, [usuario]);

  const handleSave = async () => {
    if (!usuario) return;
    setSaving(true);
    try {
      await updateUsuario(usuario.id, { nome });
      // Atualizar localStorage
      const updated = { ...usuario, nome };
      localStorage.setItem('estoque_usuario', JSON.stringify(updated));
      setSucesso(true);
      setTimeout(() => setSucesso(false), 3000);
    } catch (err: any) {
      alert(err?.message || 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!usuario) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">Você não está logado</p>
          <Button variant="primary" className="mt-4" onClick={() => router.push('/login')}>Fazer Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><Settings className="w-5 h-5 text-gray-700" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-red-500">{usuario.nome.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{usuario.nome}</p>
            <Badge variant="info">{perfilLabel[usuario.perfil] || usuario.perfil}</Badge>
          </div>
        </div>

        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Input label="Telefone" value={usuario.telefone} disabled />
        <Input label="Perfil" value={perfilLabel[usuario.perfil] || usuario.perfil} disabled />

        {sucesso && <p className="text-sm text-green-600">✓ Salvo com sucesso</p>}

        <Button variant="primary" className="w-full" onClick={handleSave} disabled={saving || nome === usuario.nome}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar
        </Button>

        <Button variant="outline" className="w-full" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" /> Sair
        </Button>
      </div>
    </div>
  );
}
