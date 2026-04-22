import { Usuario } from '@/types/database';

const AUTH_KEY = 'estoque_usuario';
const SENHA_SESSION_KEY = 'estoque_senha_operacional_session';

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

/** Armazena a senha apenas na sessão do navegador (some ao fechar a aba). */
export function setSenhaOperacionalSession(senha: string): void {
  if (typeof window === 'undefined') return;
  if (!senha) return;
  sessionStorage.setItem(SENHA_SESSION_KEY, senha);
}

export function getSenhaOperacionalSession(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(SENHA_SESSION_KEY) || '';
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(SENHA_SESSION_KEY);
}

export function isAdmin(usuario: Usuario | null): boolean {
  return usuario?.perfil === 'ADMIN_MASTER';
}

export function isManager(usuario: Usuario | null): boolean {
  return usuario?.perfil === 'MANAGER' || usuario?.perfil === 'ADMIN_MASTER';
}

export function isDriver(usuario: Usuario | null): boolean {
  return usuario?.perfil === 'DRIVER' || usuario?.perfil === 'OPERATOR_WAREHOUSE_DRIVER';
}
