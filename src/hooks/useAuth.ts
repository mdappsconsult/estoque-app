'use client';

import { useState, useEffect, useCallback } from 'react';
import { Usuario } from '@/types/database';
import { getUsuarioLogado, setUsuarioLogado, logout as doLogout } from '@/lib/auth';

export function useAuth() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUsuario(getUsuarioLogado());
    setLoading(false);
  }, []);

  const login = useCallback((u: Usuario) => {
    setUsuarioLogado(u);
    setUsuario(u);
  }, []);

  const logout = useCallback(() => {
    doLogout();
    setUsuario(null);
  }, []);

  return { usuario, loading, login, logout };
}
