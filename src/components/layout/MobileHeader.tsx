'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ClipboardList, LogOut, Settings, Timer } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useValidadeAlert } from '@/components/validade/ValidadeAlertProvider';
import { useProtocoloAlert } from '@/components/protocolos/ProtocoloAlertProvider';
import { useAppPedidosMode } from '@/hooks/useAppPedidosMode';
import { APP_PEDIDOS_NOME, loginUrlAppPedidos } from '@/lib/app-pedidos-mode';
import { LogoKim } from '@/components/branding/LogoKim';

export default function MobileHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario, logout } = useAuth();
  const validade = useValidadeAlert();
  const protocolo = useProtocoloAlert();
  const pedidosMode = useAppPedidosMode();
  const showBack = pedidosMode ? pathname !== '/protocolos' : pathname !== '/';

  const badgeValidade =
    validade.podeValidades &&
    !validade.loading &&
    validade.total > 0 &&
    validade.severidade !== 'nenhum';
  const badgeProtocolo =
    protocolo.podeProtocolos && !protocolo.loading && protocolo.total > 0;

  if (pathname === '/login') return null;

  const handleLogout = () => {
    const loginUrl = loginUrlAppPedidos();
    logout();
    router.replace(loginUrl);
  };

  const backHref = pedidosMode ? '/protocolos' : '/';

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {showBack && (
          <Link
            href={backHref}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
        )}
        <LogoKim className="max-h-9 w-auto shrink-0 rounded-md" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {pedidosMode ? APP_PEDIDOS_NOME : 'Açaí do Kim'}
          </p>
          <p className="text-xs text-gray-500 truncate">{usuario?.nome || '—'}</p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!pedidosMode && usuario && protocolo.podeProtocolos && (
          <Link
            href="/protocolos"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="Pedidos / Protocolos"
          >
            <ClipboardList className="h-5 w-5" />
            {badgeProtocolo && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                {protocolo.total > 99 ? '99+' : protocolo.total}
              </span>
            )}
          </Link>
        )}
        {pedidosMode && usuario && (
          <Link
            href="/configuracoes/perfil"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="Meu perfil"
          >
            <Settings className="h-5 w-5" />
          </Link>
        )}
        {!pedidosMode && usuario && validade.podeValidades && (
          <Link
            href="/validades"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="Validades"
          >
            <Timer className="h-5 w-5" />
            {badgeValidade && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                {validade.total > 99 ? '99+' : validade.total}
              </span>
            )}
          </Link>
        )}
        {usuario && (
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
