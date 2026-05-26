'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEffectivePermissionsMap } from '@/hooks/useEffectivePermissionsMap';
import { hasAccessWithMap } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import {
  contarProtocolosBadge,
  eGestao,
  eOperador,
  listarProtocolosNaoLidosIds,
} from '@/lib/services/protocolos';

type ProtocoloAlertContextValue = {
  /** Pedidos com msg/status não lidos (estilo WhatsApp). */
  total: number;
  naoLidosIds: ReadonlySet<string>;
  loading: boolean;
  podeProtocolos: boolean;
  refetch: () => Promise<void>;
};

const ProtocoloAlertContext = createContext<ProtocoloAlertContextValue | null>(null);

export function useProtocoloAlert(): ProtocoloAlertContextValue {
  const ctx = useContext(ProtocoloAlertContext);
  if (!ctx) {
    return {
      total: 0,
      naoLidosIds: new Set(),
      loading: false,
      podeProtocolos: false,
      refetch: async () => {},
    };
  }
  return ctx;
}

export function ProtocoloAlertProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const permissionsMap = useEffectivePermissionsMap();

  const podeProtocolos = Boolean(
    usuario &&
      hasAccessWithMap(usuario.perfil, '/protocolos', permissionsMap) &&
      (eGestao(usuario.perfil) || eOperador(usuario.perfil))
  );

  const [total, setTotal] = useState(0);
  const [naoLidosIds, setNaoLidosIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    if (!usuario || !podeProtocolos) {
      setTotal(0);
      setNaoLidosIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [n, ids] = await Promise.all([
        contarProtocolosBadge(usuario),
        listarProtocolosNaoLidosIds(usuario),
      ]);
      setTotal(n);
      setNaoLidosIds(new Set(ids));
    } catch {
      // silencioso — badge é informativo
    } finally {
      setLoading(false);
    }
  }, [usuario, podeProtocolos]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void carregar();
    });
    return () => cancelAnimationFrame(id);
  }, [carregar]);

  // Realtime: protocolo ou comentário novo → recarrega contagem com debounce
  useEffect(() => {
    if (!podeProtocolos) return;
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void carregar();
      }, 300);
    };
    const ch = supabase
      .channel('protocolos-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'protocolos' }, schedule)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'protocolo_comentarios' },
        schedule
      )
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(ch);
    };
  }, [podeProtocolos, carregar]);

  useEffect(() => {
    const onFocus = () => void carregar();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [carregar]);

  const value = useMemo<ProtocoloAlertContextValue>(
    () => ({ total, naoLidosIds, loading, podeProtocolos, refetch: carregar }),
    [total, naoLidosIds, loading, podeProtocolos, carregar]
  );

  return (
    <ProtocoloAlertContext.Provider value={value}>{children}</ProtocoloAlertContext.Provider>
  );
}
