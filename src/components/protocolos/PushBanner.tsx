'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, X, Smartphone, Loader2 } from 'lucide-react';
import {
  cancelarPush,
  ehIos,
  ehStandalonePwa,
  inscreverPush,
  jaEstaInscrito,
  suportePushNavegador,
} from '@/lib/push/cliente';
import { useAuth } from '@/hooks/useAuth';

const DISMISS_KEY = 'protocolos-push-banner-dismiss-v1';

export default function PushBanner() {
  const { usuario } = useAuth();
  const [estado, setEstado] = useState<
    | { tipo: 'carregando' }
    | { tipo: 'inscrito' }
    | { tipo: 'oferecer' }
    | { tipo: 'ios-precisa-pwa' }
    | { tipo: 'nao-suportado' }
    | { tipo: 'oculto' }
  >({ tipo: 'carregando' });
  const [acao, setAcao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const sincronizar = useCallback(async () => {
    setErro(null);
    if (typeof window === 'undefined') return;

    if (window.localStorage.getItem(DISMISS_KEY) === '1') {
      setEstado({ tipo: 'oculto' });
      return;
    }

    const inscrito = await jaEstaInscrito();
    if (inscrito) {
      setEstado({ tipo: 'inscrito' });
      return;
    }

    if (ehIos() && !ehStandalonePwa()) {
      setEstado({ tipo: 'ios-precisa-pwa' });
      return;
    }

    const suporte = suportePushNavegador();
    if (!suporte.ok) {
      setEstado({ tipo: 'nao-suportado' });
      return;
    }

    if (Notification.permission === 'denied') {
      setEstado({ tipo: 'nao-suportado' });
      return;
    }

    setEstado({ tipo: 'oferecer' });
  }, []);

  useEffect(() => {
    void sincronizar();
  }, [sincronizar]);

  if (!usuario) return null;

  const ativar = async () => {
    const loginOp = usuario.login_operacional?.trim();
    if (!loginOp) {
      setErro(
        'Seu usuário não tem login operacional cadastrado. Peça ao admin para configurar em Cadastros → Usuários.'
      );
      return;
    }
    setAcao(true);
    setErro(null);
    const r = await inscreverPush({ loginOperacional: loginOp });
    setAcao(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setEstado({ tipo: 'inscrito' });
  };

  const desativar = async () => {
    const loginOp = usuario.login_operacional?.trim();
    if (!loginOp) return;
    if (!confirm('Parar de receber avisos neste aparelho?')) return;
    setAcao(true);
    try {
      await cancelarPush({ loginOperacional: loginOp });
      setEstado({ tipo: 'oferecer' });
    } finally {
      setAcao(false);
    }
  };

  const ocultar = () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setEstado({ tipo: 'oculto' });
  };

  if (estado.tipo === 'carregando' || estado.tipo === 'oculto' || estado.tipo === 'nao-suportado') {
    return null;
  }

  if (estado.tipo === 'inscrito') {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
        <span className="inline-flex items-center gap-2 text-emerald-800">
          <Bell className="h-4 w-4" /> Avisos no celular ligados aqui.
        </span>
        <button
          onClick={desativar}
          disabled={acao}
          className="inline-flex items-center gap-1 text-xs text-emerald-700 underline hover:text-emerald-900 disabled:opacity-50"
        >
          {acao ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellOff className="h-3 w-3" />}
          Desligar neste aparelho
        </button>
      </div>
    );
  }

  if (estado.tipo === 'ios-precisa-pwa') {
    return (
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
        <div className="flex items-start gap-2">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="flex-1">
            <p className="font-semibold text-blue-900">
              Para receber avisos no iPhone, instale o app na tela
            </p>
            <p className="mt-1 text-blue-800">
              No Safari: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>. Depois
              abra pelo ícone do Açaí do Kim e clique aqui de novo.
            </p>
          </div>
          <button
            onClick={ocultar}
            className="text-blue-500 hover:text-blue-700"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // estado.tipo === 'oferecer'
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="font-semibold text-amber-900">Receber avisos no celular</p>
          <p className="mt-1 text-amber-800">
            A gente envia um aviso quando alguém abre, aceita, comenta ou encerra um pedido — sem
            precisar deixar a tela aberta.
          </p>
          {erro && <p className="mt-2 text-red-700 text-xs">{erro}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={ativar}
              disabled={acao}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {acao ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Bell className="h-3 w-3" />
              )}
              Ativar avisos
            </button>
            <button
              onClick={ocultar}
              className="rounded-lg border border-amber-300 px-3 py-2 text-xs text-amber-800 hover:bg-amber-100"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
