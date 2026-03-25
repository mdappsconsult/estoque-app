'use client';

import { useState, useEffect, useCallback } from 'react';
import { Usuario } from '@/types/database';
import { getUsuarioLogado, setUsuarioLogado, logout as doLogout } from '@/lib/auth';
import { getUsuarioById } from '@/lib/services/usuarios';

export function useAuth() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    const inicial = getUsuarioLogado();
    setUsuario(inicial);

    const sincronizarComBanco = async () => {
      if (!inicial?.id) {
        if (ativo) setLoading(false);
        return;
      }
      try {
        const atualizado = await getUsuarioById(inicial.id);
        if (!ativo) return;

        if (!atualizado || atualizado.status !== 'ativo') {
          doLogout();
          setUsuario(null);
          setLoading(false);
          return;
        }

        setUsuarioLogado(atualizado);
        setUsuario(atualizado);
      } catch {
        // Em caso de falha temporária de rede, mantém sessão local.
      } finally {
        if (ativo) setLoading(false);
      }
    };

    void sincronizarComBanco();
    return () => {
      ativo = false;
    };
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
