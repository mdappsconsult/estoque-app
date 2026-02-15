import { supabase } from '@/lib/supabase';
import { Usuario, UsuarioInsert, UsuarioUpdate } from '@/types/database';

export interface UsuarioComLocal extends Usuario {
  local_padrao?: { id: string; nome: string; tipo: string } | null;
}

export async function getUsuarios(): Promise<UsuarioComLocal[]> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*, local_padrao:locais!local_padrao_id(id, nome, tipo)')
    .order('nome');
  if (error) throw error;
  return data || [];
}

export async function getUsuarioById(id: string): Promise<UsuarioComLocal | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*, local_padrao:locais!local_padrao_id(id, nome, tipo)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function getUsuarioByTelefone(telefone: string): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('telefone', telefone)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function createUsuario(usuario: UsuarioInsert): Promise<Usuario> {
  const { data, error } = await supabase
    .from('usuarios')
    .insert(usuario)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUsuario(id: string, usuario: UsuarioUpdate): Promise<Usuario> {
  const { data, error } = await supabase
    .from('usuarios')
    .update(usuario)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteUsuario(id: string): Promise<void> {
  const { error } = await supabase.from('usuarios').delete().eq('id', id);
  if (error) throw error;
}
