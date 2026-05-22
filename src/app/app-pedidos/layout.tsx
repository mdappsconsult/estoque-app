import type { Metadata } from 'next';
import {
  APP_PEDIDOS_APPLE_ICON,
  APP_PEDIDOS_MANIFEST,
  APP_PEDIDOS_NOME,
} from '@/lib/app-pedidos-mode';

export const metadata: Metadata = {
  title: APP_PEDIDOS_NOME,
  applicationName: APP_PEDIDOS_NOME,
  description: 'Abrir e acompanhar protocolos da operação — Açaí do Kim',
  manifest: APP_PEDIDOS_MANIFEST,
  appleWebApp: {
    capable: true,
    title: APP_PEDIDOS_NOME,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: [{ url: APP_PEDIDOS_APPLE_ICON, type: 'image/png', sizes: '180x180' }],
    icon: [
      { url: '/branding/kim-protocol/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/branding/kim-protocol/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
  },
};

export default function AppPedidosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
