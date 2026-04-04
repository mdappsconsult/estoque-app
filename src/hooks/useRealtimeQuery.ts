'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeQueryOptions<T> {
  table: string;
  select?: string;
  filter?: { column: string; value: string | number };
  filters?: { column: string; value: string | number }[];
  orderBy?: { column: string; ascending?: boolean };
  enabled?: boolean;
  transform?: (data: Record<string, unknown>[]) => T[] | Promise<T[]>;
  pageSize?: number;
  /** Se definido, não conta a tabela inteira: busca só as N linhas mais recentes (útil com `orderBy` decrescente). */
  maxRows?: number;
  /** Atrasa refetch após evento realtime (ms). Evita tempestade de requisições. */
  refetchDebounceMs?: number;
}

interface UseRealtimeQueryResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useRealtimeQuery<T = Record<string, unknown>>(
  options: UseRealtimeQueryOptions<T>
): UseRealtimeQueryResult<T> {
  const {
    table,
    select = '*',
    filter,
    filters,
    orderBy,
    enabled = true,
    transform,
    pageSize = 1000,
    maxRows,
    refetchDebounceMs = 0,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const task = (async () => {
      try {
        const filtrosAplicados = [...(filters || []), ...(filter ? [filter] : [])];
        /* Encadeamento dinâmico do client PostgREST (tipos internos não expostos de forma estável). */
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const applyClauses = <Q,>(query: Q): Q => {
          let q: any = query;
          filtrosAplicados.forEach((f) => {
            q = q.eq(f.column, f.value);
          });
          if (orderBy) {
            q = q.order(orderBy.column, {
              ascending: orderBy.ascending ?? true,
            });
          }
          return q as Q;
        };
        /* eslint-enable @typescript-eslint/no-explicit-any */

        const result: unknown[] = [];
        const batchSize = Math.max(1, Math.min(pageSize, 1000));

        if (maxRows != null && maxRows > 0) {
          const cap = maxRows;
          for (let offset = 0; offset < cap; offset += batchSize) {
            const end = Math.min(offset + batchSize - 1, cap - 1);
            const { data: page, error: fetchError } = await applyClauses(
              supabase.from(table).select(select).range(offset, end)
            );
            if (fetchError) throw fetchError;
            const chunk = page || [];
            result.push(...chunk);
            if (chunk.length === 0 || chunk.length < end - offset + 1) break;
          }
        } else {
          const { count, error: countError } = await applyClauses(
            supabase.from(table).select('*', { count: 'exact', head: true })
          );
          if (countError) throw countError;

          const total = count ?? 0;
          if (total === 0) {
            setData([]);
            setError(null);
            return;
          }

          const offsets: number[] = [];
          for (let offset = 0; offset < total; offset += batchSize) {
            offsets.push(offset);
          }

          const maxParallel = 4;
          const pagesByOffset = new Map<number, unknown[]>();

          for (let i = 0; i < offsets.length; i += maxParallel) {
            const chunkOffsets = offsets.slice(i, i + maxParallel);
            const responses = await Promise.all(
              chunkOffsets.map(async (offset) => {
                const { data: page, error: fetchError } = await applyClauses(
                  supabase
                    .from(table)
                    .select(select)
                    .range(offset, offset + batchSize - 1)
                );
                if (fetchError) throw fetchError;
                return { offset, page: page || [] };
              })
            );

            responses.forEach(({ offset, page }) => {
              pagesByOffset.set(offset, page);
            });
          }

          offsets
            .sort((a, b) => a - b)
            .forEach((offset) => {
              result.push(...(pagesByOffset.get(offset) || []));
            });
        }

        const finalData = transform
          ? await transform(result as Record<string, unknown>[])
          : (result as T[]);

        setData(finalData);
        setError(null);
      } catch (err) {
        console.error(`Erro ao buscar ${table}:`, err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    })();

    inFlightRef.current = task;
    try {
      await task;
    } finally {
      inFlightRef.current = null;
    }
    // filter/orderBy: colunas em deps; objetos completos gerariam refetch em todo render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentário acima
  }, [
    table,
    select,
    filter?.column,
    filter?.value,
    filters,
    orderBy?.column,
    orderBy?.ascending,
    transform,
    pageSize,
    maxRows,
  ]);

  useEffect(() => {
    if (!enabled) return;

    // Fetch inicial
    fetchData();

    // Subscribe para mudanças em tempo real
    const filtroRealtime = (filters && filters.length > 0 ? filters[0] : filter) || null;
    const scheduleRefetch = () => {
      if (refetchDebounceMs > 0) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          void fetchData();
        }, refetchDebounceMs);
      } else {
        void fetchData();
      }
    };

    const channel = supabase
      .channel(`realtime-${table}-${filtroRealtime?.value || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: table,
          ...(filtroRealtime ? { filter: `${filtroRealtime.column}=eq.${filtroRealtime.value}` } : {}),
        },
        () => {
          scheduleRefetch();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canal realtime usa só fetchData estável por tabela
  }, [enabled, fetchData, refetchDebounceMs]);

  return { data, loading, error, refetch: fetchData };
}
