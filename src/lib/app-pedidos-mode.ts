/** App enxuto «Kim Protocol» — ativado ao abrir /app-pedidos (PWA ou link). */
export const APP_PEDIDOS_MODE_KEY = 'estoque_app_pedidos_mode_v1';

/** Nome exibido na PWA, login e header do app enxuto. */
export const APP_PEDIDOS_NOME = 'Kim Protocol';

/** Ícones PWA (quadrados, logo preenchendo o canvas). */
export const APP_PEDIDOS_ICON_DIR = '/branding/kim-protocol';
export const APP_PEDIDOS_APPLE_ICON = `${APP_PEDIDOS_ICON_DIR}/apple-touch-icon.png`;
export const APP_PEDIDOS_MANIFEST = '/manifest-pedidos.webmanifest';

/** Rotas acessíveis no modo pedidos (além de login e entrada do app). */
export const ROTAS_MODO_PEDIDOS = ['/app-pedidos', '/protocolos', '/configuracoes/perfil'] as const;

export function activateAppPedidosMode(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(APP_PEDIDOS_MODE_KEY, '1');
}

export function clearAppPedidosMode(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(APP_PEDIDOS_MODE_KEY);
  window.sessionStorage.removeItem(APP_PEDIDOS_MODE_KEY);
}

export function isAppPedidosMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.localStorage.getItem(APP_PEDIDOS_MODE_KEY) === '1') return true;
  // Migração: versão anterior usava sessionStorage (perdia no logout em alguns PWAs).
  if (window.sessionStorage.getItem(APP_PEDIDOS_MODE_KEY) === '1') {
    window.localStorage.setItem(APP_PEDIDOS_MODE_KEY, '1');
    window.sessionStorage.removeItem(APP_PEDIDOS_MODE_KEY);
    return true;
  }
  return false;
}

export function rotaPermitidaNoModoPedidos(pathname: string): boolean {
  if (pathname === '/login') return true;
  return ROTAS_MODO_PEDIDOS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );
}

export function loginUrlAppPedidos(): string {
  return isAppPedidosMode() ? '/login?app=pedidos' : '/login';
}

export function destinoPosLogin(): '/' | '/protocolos' {
  return isAppPedidosMode() ? '/protocolos' : '/';
}

/** Perfis que podem usar o app de pedidos (mesma regra de /protocolos). */
export function perfilPodeUsarAppPedidos(perfil: string): boolean {
  return [
    'ADMIN_MASTER',
    'MANAGER',
    'OPERATOR_WAREHOUSE',
    'OPERATOR_WAREHOUSE_DRIVER',
    'OPERATOR_STORE',
  ].includes(perfil);
}
