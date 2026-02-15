// Map de rota -> perfis permitidos
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE', 'DRIVER'],
  '/login': ['*'],
  '/qrcode': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE', 'DRIVER'],
  '/entrada-compra': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE'],
  '/producao': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE'],
  '/etiquetas': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE'],
  '/separar-por-loja': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE'],
  '/viagem-aceite': ['ADMIN_MASTER', 'MANAGER', 'DRIVER'],
  '/recebimento': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_STORE'],
  '/transferencia-loja': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_STORE'],
  '/aceites-pendentes': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_STORE', 'DRIVER'],
  '/baixa-diaria': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE'],
  '/perdas': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE'],
  '/contagem': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE'],
  '/estoque': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE'],
  '/validades': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE'],
  '/divergencias': ['ADMIN_MASTER', 'MANAGER'],
  '/rastreio-qr': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE'],
  '/dashboard-admin': ['ADMIN_MASTER', 'MANAGER'],
  '/relatorios': ['ADMIN_MASTER', 'MANAGER'],
  '/cadastros/produtos': ['ADMIN_MASTER', 'MANAGER'],
  '/cadastros/locais': ['ADMIN_MASTER', 'MANAGER'],
  '/cadastros/usuarios': ['ADMIN_MASTER'],
  '/configuracoes/perfil': ['ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE', 'DRIVER'],
};

export function hasAccess(perfil: string, pathname: string): boolean {
  const allowed = ROUTE_PERMISSIONS[pathname];
  if (!allowed) return true; // rotas não mapeadas são acessíveis
  if (allowed.includes('*')) return true;
  return allowed.includes(perfil);
}

export function getAccessibleRoutes(perfil: string): string[] {
  return Object.entries(ROUTE_PERMISSIONS)
    .filter(([, roles]) => roles.includes('*') || roles.includes(perfil))
    .map(([route]) => route);
}

export function canSeeCosts(perfil: string): boolean {
  return ['ADMIN_MASTER', 'MANAGER'].includes(perfil);
}
