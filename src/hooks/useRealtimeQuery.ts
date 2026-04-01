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
  transform?: (data: any[]) => T[] | Promise<T[]>;
  pageSize?: number;
}

interface UseRealtimeQueryResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useRealtimeQuery<T = any>(
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
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const fetchData = useCallback(async () => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const task = (async () => {
      try {
        const filtrosAplicados = [...(filters || []), ...(filter ? [filter] : [])];
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

        const result: any[] = [];
        const batchSize = Math.max(1, Math.min(pageSize, 1000));

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

        // Reduz latência total em tabelas grandes sem sobrecarregar o banco.
        const maxParallel = 4;
        const pagesByOffset = new Map<number, any[]>();

        for (let i = 0; i < offsets.length; i += maxParallel) {
          const chunk = offsets.slice(i, i + maxParallel);
          const responses = await Promise.all(
            chunk.map(async (offset) => {
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

        const finalData = transform
          ? await transform(result)
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
  }, [table, select, filter?.column, filter?.value, filters, orderBy?.column, orderBy?.ascending, transform, pageSize]);

  useEffect(() => {
    if (!enabled) return;

    // Fetch inicial
    fetchData();

    // Subscribe para mudanças em tempo real
    const filtroRealtime = (filters && filters.length > 0 ? filters[0] : filter) || null;
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
        (_payload) => {
          // Re-fetch ao receber qualquer mudança
          // Mais simples e seguro que tentar merge manual
          fetchData();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [enabled, fetchData]);

  return { data, loading, error, refetch: fetchData };
}
