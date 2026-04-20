'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, LogOut, Timer } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useValidadeAlert } from '@/components/validade/ValidadeAlertProvider';
import { LogoKim } from '@/components/branding/LogoKim';

export default function MobileHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario, logout } = useAuth();
  const validade = useValidadeAlert();
  const showBack = pathname !== '/';

  const badgeValidade =
    validade.podeValidades &&
    !validade.loading &&
    validade.total > 0 &&
    validade.severidade !== 'nenhum';

  if (pathname === '/login') return null;

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {showBack && (
          <Link
            href="/"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
        )}
        <LogoKim className="max-h-9 w-auto shrink-0 rounded-md" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">Açaí do Kim</p>
          <p className="text-xs text-gray-500 truncate">{usuario?.nome || '—'}</p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {usuario && validade.podeValidades && (
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
