'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeQueryOptions<T> {
  table: string;
  select?: string;
  filter?: { column: string; value: string | number };
  orderBy?: { column: string; ascending?: boolean };
  enabled?: boolean;
  transform?: (data: any[]) => T[] | Promise<T[]>;
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
    orderBy,
    enabled = true,
    transform,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchData = useCallback(async () => {
    try {
      let query = supabase.from(table).select(select);

      if (filter) {
        query = query.eq(filter.column, filter.value);
      }

      if (orderBy) {
        query = query.order(orderBy.column, {
          ascending: orderBy.ascending ?? true,
        });
      }

      const { data: result, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const finalData = transform
        ? await transform(result || [])
        : (result as T[]) || [];

      setData(finalData);
      setError(null);
    } catch (err) {
      console.error(`Erro ao buscar ${table}:`, err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [table, select, filter?.column, filter?.value, orderBy?.column, orderBy?.ascending]);

  useEffect(() => {
    if (!enabled) return;

    // Fetch inicial
    fetchData();

    // Subscribe para mudanças em tempo real
    const channel = supabase
      .channel(`realtime-${table}-${filter?.value || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: table,
          ...(filter ? { filter: `${filter.column}=eq.${filter.value}` } : {}),
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
