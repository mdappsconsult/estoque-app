'use client';

import { usePathname } from 'next/navigation';
import { isAppPedidosMode } from '@/lib/app-pedidos-mode';

export function useAppPedidosMode(): boolean {
  const pathname = usePathname();
  // Reavalia ao mudar de rota (sessionStorage é síncrono).
  void pathname;
  return isAppPedidosMode();
}
