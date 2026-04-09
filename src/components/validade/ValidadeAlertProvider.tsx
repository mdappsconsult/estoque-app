'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEffectivePermissionsMap } from '@/hooks/useEffectivePermissionsMap';
import { escopoValidadesPorPerfil } from '@/lib/operador-loja-scope';
import { hasAccessWithMap } from '@/lib/permissions';
import { listarItensAlertaValidade } from '@/lib/services/validades-itens';

/** Janela de aviso “a vencer” (dias). A tela /validades mantém filtros próprios. */
export const DIAS_AVISO_VALIDADE_HOME = 3;

export type SeveridadeValidade = 'nenhum' | 'atencao' | 'critico';

type ValidadeAlertContextValue = {
  nVencidos: number;
  nProximos: number;
  total: number;
  loading: boolean;
  error: string | null;
  severidade: SeveridadeValidade;
  podeValidades: boolean;
  refetch: () => Promise<void>;
};

const ValidadeAlertContext = createContext<ValidadeAlertContextValue | null>(null);

export function useValidadeAlert(): ValidadeAlertContextValue {
  const ctx = useContext(ValidadeAlertContext);
  if (!ctx) {
    throw new Error('useValidadeAlert deve estar dentro de ValidadeAlertProvider');
  }
  return ctx;
}

/** Versão segura para componentes que podem renderizar fora do provider (não usado hoje). */
export function useValidadeAlertOptional(): ValidadeAlertContextValue | null {
  return useContext(ValidadeAlertContext);
}

export function ValidadeAlertProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const permissionsMap = useEffectivePermissionsMap();

  const podeValidades = Boolean(
    usuario && hasAccessWithMap(usuario.perfil, '/validades', permissionsMap)
  );

  const escopo = useMemo(() => escopoValidadesPorPerfil(usuario), [usuario]);

  const [nVencidos, setNVencidos] = useState(0);
  const [nProximos, setNProximos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!podeValidades) {
      setNVencidos(0);
      setNProximos(0);
      setError(null);
      setLoading(false);
      return;
    }
    if (escopo.tipo !== 'local' && escopo.tipo !== 'todos_locais') {
      setNVencidos(0);
      setNProximos(0);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const localId = escopo.tipo === 'local' ? escopo.localId : undefined;
    const { vencidos, proximos, error: err } = await listarItensAlertaValidade({
      localAtualId: localId,
      diasProximos: DIAS_AVISO_VALIDADE_HOME,
      limiteVencidos: 200,
      limiteProximos: 200,
    });
    if (err) {
      setError(err);
      setNVencidos(0);
      setNProximos(0);
    } else {
      setNVencidos(vencidos.length);
      setNProximos(proximos.length);
    }
    setLoading(false);
  }, [podeValidades, escopo]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void carregar();
    });
    return () => cancelAnimationFrame(id);
  }, [carregar]);

  useEffect(() => {
    const onFocus = () => void carregar();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [carregar]);

  const severidade: SeveridadeValidade =
    nVencidos > 0 ? 'critico' : nProximos > 0 ? 'atencao' : 'nenhum';

  const value = useMemo<ValidadeAlertContextValue>(
    () => ({
      nVencidos,
      nProximos,
      total: nVencidos + nProximos,
      loading,
      error,
      severidade,
      podeValidades,
      refetch: carregar,
    }),
    [nVencidos, nProximos, loading, error, severidade, podeValidades, carregar]
  );

  return (
    <ValidadeAlertContext.Provider value={value}>{children}</ValidadeAlertContext.Provider>
  );
}
