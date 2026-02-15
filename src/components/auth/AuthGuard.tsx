'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { hasAccess } from '@/lib/permissions';
import MobileHeader from '@/components/layout/MobileHeader';
import { ShieldX } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { usuario, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!loading && !usuario && !isLoginPage) {
      router.replace('/login');
    }
  }, [loading, usuario, isLoginPage, router]);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
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
  if (!hasAccess(usuario.perfil, pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldX className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Acesso negado</h1>
          <p className="text-gray-500 mb-6">Você não tem permissão para acessar esta página.</p>
          <button
            onClick={() => router.replace('/')}
            className="px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  // Authenticated with access
  return (
    <>
      <MobileHeader />
      <main className="p-4 min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
    </>
  );
}
