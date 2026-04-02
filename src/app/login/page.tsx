'use client';

import { useState } from 'react';
import { Loader2, LogIn, User } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { autenticarOperacional } from '@/lib/services/acesso';

export default function LoginPage() {
  const { login } = useAuth();
  const [usuarioLogin, setUsuarioLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const entrar = async () => {
    if (!usuarioLogin.trim() || !senha.trim()) return;
    setLoading(true);
    setErro('');

    try {
      const usuario = await autenticarOperacional(usuarioLogin, senha);
      login(usuario);
      window.location.href = '/';
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 -mt-14">
      <div className="w-full max-w-sm mx-auto p-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">E</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Estoque QR</h1>
          <p className="text-gray-500 mt-1">Controle de estoque unitário</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="text-center mb-2">
            <User className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <h2 className="text-lg font-semibold text-gray-900">Entrar no sistema</h2>
            <p className="text-sm text-gray-500">Acesso por usuário e senha</p>
          </div>

          <Input
            label="Usuário"
            placeholder="Usuário"
            value={usuarioLogin}
            onChange={(e) => setUsuarioLogin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && entrar()}
            type="text"
            autoFocus
            required
          />

          <Input
            label="Senha"
            placeholder="Digite sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && entrar()}
            type="password"
            required
          />

          {erro && <p className="text-sm text-red-500">{erro}</p>}

          <Button variant="primary" className="w-full" onClick={entrar} disabled={loading || !usuarioLogin.trim() || !senha.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogIn className="w-4 h-4 mr-2" />}
            Entrar
          </Button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Acesso restrito a usuários cadastrados
        </p>
      </div>
    </div>
  );
}
