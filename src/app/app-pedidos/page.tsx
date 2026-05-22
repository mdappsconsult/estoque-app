'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { activateAppPedidosMode, APP_PEDIDOS_NOME } from '@/lib/app-pedidos-mode';
import { useAuth } from '@/hooks/useAuth';
import { LogoKim } from '@/components/branding/LogoKim';

export default function AppPedidosEntryPage() {
  const router = useRouter();
  const { usuario, loading } = useAuth();

  useEffect(() => {
    activateAppPedidosMode();
    if (loading) return;
    if (usuario) {
      router.replace('/protocolos');
    } else {
      router.replace('/login?app=pedidos');
    }
  }, [loading, usuario, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-gray-50">
      <LogoKim className="max-h-16 w-auto opacity-90" priority />
      <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-500">Abrindo {APP_PEDIDOS_NOME}…</p>
    </div>
  );
}
