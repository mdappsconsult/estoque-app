import { supabase } from '@/lib/supabase';
import { Local, LocalInsert, LocalUpdate } from '@/types/database';

export async function getLocais(): Promise<Local[]> {
  const { data, error } = await supabase
    .from('locais')
    .select('*')
    .order('nome');
  if (error) throw error;
  return data || [];
}

export async function getLocalById(id: string): Promise<Local | null> {
  const { data, error } = await supabase
    .from('locais')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createLocal(local: LocalInsert): Promise<Local> {
  const { data, error } = await supabase
    .from('locais')
    .insert(local)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLocal(id: string, local: LocalUpdate): Promise<Local> {
  const { data, error } = await supabase
    .from('locais')
    .update(local)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLocal(id: string): Promise<void> {
  const { error } = await supabase.from('locais').delete().eq('id', id);
  if (error) throw error;
}
