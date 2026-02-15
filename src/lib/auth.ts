import { Usuario } from '@/types/database';

const AUTH_KEY = 'estoque_usuario';

export function getUsuarioLogado(): Usuario | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Usuario;
  } catch {
    return null;
  }
}

export function setUsuarioLogado(usuario: Usuario): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(usuario));
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function isAdmin(usuario: Usuario | null): boolean {
  return usuario?.perfil === 'ADMIN_MASTER';
}

export function isManager(usuario: Usuario | null): boolean {
  return usuario?.perfil === 'MANAGER' || usuario?.perfil === 'ADMIN_MASTER';
}

export function isDriver(usuario: Usuario | null): boolean {
  return usuario?.perfil === 'DRIVER';
}
