'use client';

import { useEffect, useState } from 'react';
import {
  type PiPrintConnection,
  resolvePiPrintConnection,
} from '@/lib/printing/pi-print-ws-client';
import type { ImpressaoPiPapel } from '@/lib/services/config-impressao-pi';

export function usePiPrintBridgeConfig(options?: { papel?: ImpressaoPiPapel; enabled?: boolean }) {
  const papel = options?.papel ?? 'estoque';
  const enabled = options?.enabled ?? true;
  const [loading, setLoading] = useState(enabled);
  const [connection, setConnection] = useState<PiPrintConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setConnection(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const c = await resolvePiPrintConnection(papel);
        if (!cancelled) {
          setConnection(c);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setConnection(null);
          setError(e instanceof Error ? e.message : 'Falha ao carregar config. impressão Pi');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [papel, enabled]);

  return {
    loading,
    available: Boolean(connection),
    connection,
    error,
  };
}
