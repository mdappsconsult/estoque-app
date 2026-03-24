'use client';

import { useEffect, useState } from 'react';
import {
  getDefaultRoutePermissions,
  getEffectiveRoutePermissions,
  PERMISSIONS_UPDATED_EVENT,
} from '@/lib/permissions';

/**
 * Mapa efetivo de rotas → perfis. No 1º paint usa só o padrão do código (igual ao SSR);
 * depois do mount aplica localStorage, evitando erro de hidratação.
 */
export function useEffectivePermissionsMap(): Record<string, string[]> {
  const [map, setMap] = useState(getDefaultRoutePermissions);

  useEffect(() => {
    const sync = () => setMap(getEffectiveRoutePermissions());
    sync();
    window.addEventListener(PERMISSIONS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(PERMISSIONS_UPDATED_EVENT, sync);
  }, []);

  return map;
}
