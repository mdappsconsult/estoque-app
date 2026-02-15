'use client';

import { useState } from 'react';
import { Phone, Loader2, ArrowRight, KeyRound } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { getUsuarioByTelefone } from '@/lib/services/usuarios';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [telefone, setTelefone] = useState('');
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const enviarCodigo = async () => {
    if (!telefone.trim()) return;
    setLoading(true);
    setErro('');
    try {
      // Verificar se telefone existe no sistema
      const usuario = await getUsuarioByTelefone(telefone.replace(/\D/g, ''));
      if (!usuario) {
        setErro('Telefone não cadastrado no sistema');
        setLoading(false);
        return;
      }
      // Em produção: enviar OTP via WhatsApp
      // Por agora: simular envio, aceitar qualquer código
      setStep('code');
    } catch (err: any) {
      setErro(err?.message || 'Erro ao enviar código');
    } finally {
      setLoading(false);
    }
  };

  const verificarCodigo = async () => {
    if (!codigo.trim()) return;
    setLoading(true);
    setErro('');
    try {
      // Em produção: verificar OTP
      // Por agora: aceitar qualquer código de 4+ dígitos
      if (codigo.length < 4) {
        setErro('Código inválido');
        setLoading(false);
        return;
      }

      const usuario = await getUsuarioByTelefone(telefone.replace(/\D/g, ''));
      if (!usuario) {
        setErro('Usuário não encontrado');
        setLoading(false);
        return;
      }

      login(usuario);
      router.push('/');
    } catch (err: any) {
      setErro(err?.message || 'Erro ao verificar código');
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

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {step === 'phone' ? (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <Phone className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <h2 className="text-lg font-semibold text-gray-900">Entrar com telefone</h2>
                <p className="text-sm text-gray-500">Enviaremos um código por WhatsApp</p>
              </div>

              <Input
                label="Telefone"
                placeholder="(99) 99999-9999"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviarCodigo()}
                type="tel"
                autoFocus
              />

              {erro && <p className="text-sm text-red-500">{erro}</p>}

              <Button variant="primary" className="w-full" onClick={enviarCodigo} disabled={loading || !telefone.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                Enviar Código
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <KeyRound className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <h2 className="text-lg font-semibold text-gray-900">Código de verificação</h2>
                <p className="text-sm text-gray-500">Enviado para {telefone}</p>
              </div>

              <Input
                label="Código"
                placeholder="0000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verificarCodigo()}
                type="text"
                maxLength={6}
                autoFocus
                className="text-center text-2xl tracking-widest"
              />

              {erro && <p className="text-sm text-red-500">{erro}</p>}

              <Button variant="primary" className="w-full" onClick={verificarCodigo} disabled={loading || !codigo.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verificar
              </Button>

              <button onClick={() => { setStep('phone'); setCodigo(''); setErro(''); }} className="w-full text-sm text-gray-500 hover:text-gray-700">
                ← Trocar telefone
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Acesso restrito a usuários cadastrados
        </p>
      </div>
    </div>
  );
}
