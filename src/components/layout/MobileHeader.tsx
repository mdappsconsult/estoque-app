'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function MobileHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario, logout } = useAuth();
  const showBack = pathname !== '/';

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
        <span className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-600 font-bold">
          E
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900">Estoque QR</p>
          <p className="text-xs text-gray-500">{usuario?.nome || 'Mobile'}</p>
        </div>
      </div>

      {usuario && (
        <button
          onClick={handleLogout}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Sair"
        >
          <LogOut className="w-4 h-4" />
        </button>
      )}
    </header>
  );
}
