'use client';

import { useEffect, useState } from 'react';
import {
  type PiPrintConnection,
  resolvePiPrintConnection,
} from '@/lib/printing/pi-print-ws-client';
import type { ImpressaoPiPapel } from '@/lib/services/config-impressao-pi';

export function usePiPrintBridgeConfig(options?: { papel?: ImpressaoPiPapel }) {
  const papel = options?.papel ?? 'estoque';
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<PiPrintConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
  }, [papel]);

  return {
    loading,
    available: Boolean(connection),
    connection,
    error,
  };
}
