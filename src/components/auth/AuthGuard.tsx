'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { rotaBloqueadaPorEscopoOperacional, usuarioPodeAcessarRota } from '@/lib/permissions';
import { useEffectivePermissionsMap } from '@/hooks/useEffectivePermissionsMap';
import { useAppPedidosMode } from '@/hooks/useAppPedidosMode';
import {
  APP_PEDIDOS_NOME,
  loginUrlAppPedidos,
  perfilPodeUsarAppPedidos,
  rotaPermitidaNoModoPedidos,
} from '@/lib/app-pedidos-mode';
import MobileHeader from '@/components/layout/MobileHeader';
import { ValidadeAlertProvider } from '@/components/validade/ValidadeAlertProvider';
import { ValidadeBanner } from '@/components/validade/ValidadeBanner';
import { ProtocoloAlertProvider } from '@/components/protocolos/ProtocoloAlertProvider';
import { ShieldX } from 'lucide-react';
import { LogoKim } from '@/components/branding/LogoKim';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const permissionsMap = useEffectivePermissionsMap();
  const pedidosMode = useAppPedidosMode();
  const isLoginPage = pathname === '/login';
  const isAppPedidosEntry = pathname === '/app-pedidos';
  /** Vitrine pública do freezer (sem login operacional). */
  const isQuiosqueVitrine = pathname?.startsWith('/f/') ?? false;

  useEffect(() => {
    if (!loading && !usuario && !isLoginPage && !isQuiosqueVitrine && !isAppPedidosEntry) {
      const loginUrl = loginUrlAppPedidos();
      router.replace(loginUrl);
    }
  }, [loading, usuario, isLoginPage, isQuiosqueVitrine, isAppPedidosEntry, router]);

  useEffect(() => {
    if (!pedidosMode || !usuario || loading) return;
    if (pathname === '/') {
      router.replace('/protocolos');
      return;
    }
    if (!perfilPodeUsarAppPedidos(usuario.perfil)) return;
    if (!rotaPermitidaNoModoPedidos(pathname)) {
      router.replace('/protocolos');
    }
  }, [pedidosMode, usuario, loading, pathname, router]);

  if (isQuiosqueVitrine || isAppPedidosEntry) {
    return <>{children}</>;
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-gray-50">
        <LogoKim className="max-h-16 w-auto opacity-90" priority />
        <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Login page — render without header
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Not authenticated
  if (!usuario) {
    return null;
  }

  // No access
  if (!usuarioPodeAcessarRota(usuario, pathname, permissionsMap)) {
    const msgEstoqueIndustria =
      rotaBloqueadaPorEscopoOperacional(usuario, pathname) &&
      'Esta conta não usa a tela Estoque. No início você encontra compra, produção, separação, etiquetas e viagem.';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldX className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Acesso negado</h1>
          <p className="text-gray-500 mb-6">
            {msgEstoqueIndustria || 'Você não tem permissão para acessar esta página.'}
          </p>
          <button
            onClick={() => router.replace(pedidosMode ? '/protocolos' : '/')}
            className="px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
          >
            {pedidosMode ? `Voltar ao ${APP_PEDIDOS_NOME}` : 'Voltar ao início'}
          </button>
        </div>
      </div>
    );
  }

  if (pedidosMode && !perfilPodeUsarAppPedidos(usuario.perfil)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldX className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{APP_PEDIDOS_NOME}</h1>
          <p className="text-gray-500 mb-6">
            Sua conta não pode abrir protocolos. Peça ao administrador ou use o app completo de estoque.
          </p>
          <button
            onClick={() => router.replace('/login')}
            className="px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
          >
            Trocar usuário
          </button>
        </div>
      </div>
    );
  }

  if (pedidosMode && !rotaPermitidaNoModoPedidos(pathname)) {
    return null;
  }

  // Authenticated with access
  const shell = (
    <>
      <MobileHeader />
      {!pedidosMode && <ValidadeBanner />}
      <main className="p-4 min-h-[calc(100vh-3.5rem)]">{children}</main>
    </>
  );

  return (
    <ValidadeAlertProvider>
      <ProtocoloAlertProvider>{shell}</ProtocoloAlertProvider>
    </ValidadeAlertProvider>
  );
}
