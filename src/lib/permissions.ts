// Mapa padrão rota -> perfis permitidos (usado como base e fallback)
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER', 'OPERATOR_STORE', 'DRIVER'],
  '/login': ['*'],
  '/qrcode': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER', 'OPERATOR_STORE', 'DRIVER'],
  '/entrada-compra': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER'],
  '/producao': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER'],
  '/etiquetas': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER'],
  '/separar-por-loja': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER'],
  '/viagem-aceite': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'DRIVER', 'OPERATOR_WAREHOUSE_DRIVER'],
  '/recebimento': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_STORE'],
  '/transferencia-loja': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_STORE'],
  '/aceites-pendentes': [
    'ADMIN_MASTER',
    'MANAGER',
    'OPERATOR_WAREHOUSE',
    'OPERATOR_STORE',
    'DRIVER',
    'OPERATOR_WAREHOUSE_DRIVER',
  ],
  '/baixa-diaria': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER', 'OPERATOR_STORE'],
  '/perdas': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER', 'OPERATOR_STORE'],
  '/contagem': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER', 'OPERATOR_STORE'],
  '/estoque': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER', 'OPERATOR_STORE'],
  '/validades': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER', 'OPERATOR_STORE'],
  '/divergencias': ['ADMIN_MASTER', 'MANAGER'],
  '/rastreio-qr': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER', 'OPERATOR_STORE'],
  '/dashboard-admin': ['ADMIN_MASTER', 'MANAGER'],
  '/relatorios': ['ADMIN_MASTER', 'MANAGER'],
  '/cadastros/produtos': ['ADMIN_MASTER', 'MANAGER'],
  '/cadastros/categorias': ['ADMIN_MASTER', 'MANAGER'],
  '/cadastros/embalagens': ['ADMIN_MASTER', 'MANAGER'],
  '/cadastros/reposicao-loja': ['ADMIN_MASTER', 'MANAGER'],
  '/cadastros/locais': ['ADMIN_MASTER', 'MANAGER'],
  '/cadastros/usuarios': ['ADMIN_MASTER'],
  '/contagem-loja': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_STORE'],
  '/configuracoes/perfil': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_WAREHOUSE_DRIVER', 'OPERATOR_STORE', 'DRIVER'],
  '/configuracoes/permissoes': ['ADMIN_MASTER'],
};

export const PERMISSIONS_STORAGE_KEY = 'estoque_permissions_matrix_v3';

export const PERMISSIONS_UPDATED_EVENT = 'estoque-permissions-updated';

/** Perfis na ordem das colunas da matriz */
export const PERFIS_COLUNA: { value: string; label: string; short: string }[] = [
  { value: 'ADMIN_MASTER', label: 'Administrador', short: 'Admin' },
  { value: 'MANAGER', label: 'Gerente', short: 'Ger.' },
  { value: 'OPERATOR_WAREHOUSE', label: 'Operador indústria', short: 'Ind.' },
  { value: 'OPERATOR_WAREHOUSE_DRIVER', label: 'Indústria + motorista', short: 'Ind.+Mot.' },
  { value: 'OPERATOR_STORE', label: 'Operador loja', short: 'Loja' },
  { value: 'DRIVER', label: 'Motorista', short: 'Mot.' },
];

/** Rotas exibidas na tela de permissões (todas as chaves de ROUTE_PERMISSIONS devem aparecer) */
export const ROUTE_UI_META: { path: string; label: string; section: string }[] = [
  { path: '/', label: 'Início', section: 'Geral' },
  { path: '/login', label: 'Login', section: 'Geral' },
  { path: '/qrcode', label: 'Scanner QR', section: 'Operações' },
  { path: '/entrada-compra', label: 'Registrar compra', section: 'Operações' },
  { path: '/producao', label: 'Produção', section: 'Operações' },
  { path: '/etiquetas', label: 'Etiquetas', section: 'Operações' },
  { path: '/separar-por-loja', label: 'Separar por loja', section: 'Operações' },
  { path: '/viagem-aceite', label: 'Viagem / aceite', section: 'Operações' },
  { path: '/recebimento', label: 'Receber entrega', section: 'Operações' },
  { path: '/transferencia-loja', label: 'Transferência loja → loja', section: 'Operações' },
  { path: '/aceites-pendentes', label: 'Aceites pendentes', section: 'Operações' },
  { path: '/baixa-diaria', label: 'Baixa diária', section: 'Operações' },
  { path: '/perdas', label: 'Perdas / descarte', section: 'Operações' },
  { path: '/contagem', label: 'Contagem', section: 'Operações' },
  { path: '/estoque', label: 'Estoque', section: 'Operações' },
  { path: '/validades', label: 'Validades', section: 'Operações' },
  { path: '/rastreio-qr', label: 'Rastreio por QR', section: 'Operações' },
  { path: '/divergencias', label: 'Divergências', section: 'Administração' },
  { path: '/dashboard-admin', label: 'Dashboard admin', section: 'Administração' },
  { path: '/relatorios', label: 'Relatórios', section: 'Administração' },
  { path: '/cadastros/produtos', label: 'Cadastro — produtos', section: 'Cadastros' },
  { path: '/cadastros/categorias', label: 'Cadastro — categorias', section: 'Cadastros' },
  { path: '/cadastros/embalagens', label: 'Cadastro — tipos de embalagem', section: 'Cadastros' },
  { path: '/cadastros/reposicao-loja', label: 'Cadastro — reposição de estoque por loja', section: 'Cadastros' },
  { path: '/cadastros/locais', label: 'Cadastro — locais', section: 'Cadastros' },
  { path: '/cadastros/usuarios', label: 'Cadastro — usuários', section: 'Cadastros' },
  { path: '/contagem-loja', label: 'Contagem da loja', section: 'Operações' },
  { path: '/configuracoes/perfil', label: 'Config. — meu perfil', section: 'Configurações' },
  { path: '/configuracoes/permissoes', label: 'Config. — permissões', section: 'Configurações' },
];

/** Cópia do mapa padrão (sem localStorage). Use no 1º render do cliente para bater com o SSR. */
export function getDefaultRoutePermissions(): Record<string, string[]> {
  return JSON.parse(JSON.stringify(ROUTE_PERMISSIONS)) as Record<string, string[]>;
}

/** Mescla padrão do código com ajustes salvos no dispositivo (localStorage). */
export function getEffectiveRoutePermissions(): Record<string, string[]> {
  const base = getDefaultRoutePermissions();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(PERMISSIONS_STORAGE_KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Record<string, string[]>;
    for (const route of Object.keys(base)) {
      if (Array.isArray(stored[route])) {
        base[route] = [...stored[route]];
      }
    }
    return base;
  } catch {
    return base;
  }
}

export function savePermissionMatrix(map: Record<string, string[]>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(PERMISSIONS_UPDATED_EVENT));
}

export function clearPermissionMatrix(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PERMISSIONS_STORAGE_KEY);
  window.dispatchEvent(new Event(PERMISSIONS_UPDATED_EVENT));
}

/** Rotas em que ADMIN_MASTER sempre mantém acesso (evita travar o sistema). */
const ADMIN_ALWAYS_ACCESS: string[] = ['/configuracoes/permissoes', '/cadastros/usuarios'];

export function hasAccessWithMap(perfil: string, pathname: string, map: Record<string, string[]>): boolean {
  if (perfil === 'ADMIN_MASTER' && ADMIN_ALWAYS_ACCESS.includes(pathname)) {
    return true;
  }
  const allowed = map[pathname];
  if (!allowed) return true;
  if (allowed.includes('*')) return true;
  return allowed.includes(perfil);
}

/** Uso em contexto sem hook (SSR ou código legado); no cliente reflete localStorage. */
export function hasAccess(perfil: string, pathname: string): boolean {
  return hasAccessWithMap(perfil, pathname, getEffectiveRoutePermissions());
}

export function getAccessibleRoutes(perfil: string, map?: Record<string, string[]>): string[] {
  const effective = map ?? getEffectiveRoutePermissions();
  return Object.entries(effective)
    .filter(([, roles]) => roles.includes('*') || roles.includes(perfil))
    .map(([route]) => route);
}

export function canSeeCosts(perfil: string): boolean {
  return ['ADMIN_MASTER', 'MANAGER'].includes(perfil);
}

export function rotaEhPublicaOuWildcard(path: string, map: Record<string, string[]>): boolean {
  const roles = map[path];
  return roles?.includes('*') ?? false;
}
