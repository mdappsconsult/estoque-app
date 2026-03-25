import { Usuario } from '@/types/database';

/** UUID da loja quando o usuário é operador de loja com local padrão definido. */
export function idLocalLojaOperadora(usuario: Usuario | null): string | null {
  if (usuario?.perfil === 'OPERATOR_STORE' && usuario.local_padrao_id) {
    return usuario.local_padrao_id;
  }
  return null;
}

/** Itens cuja posição física (`local_atual_id`) é a loja da operadora. */
export function filtrarItensPorLojaOperadora<
  T extends { local_atual_id: string | null },
>(itens: T[], usuario: Usuario | null): T[] {
  if (usuario?.perfil !== 'OPERATOR_STORE') {
    return itens;
  }
  const L = idLocalLojaOperadora(usuario);
  if (!L) {
    return [];
  }
  return itens.filter((i) => i.local_atual_id === L);
}

/**
 * Recebimento: operadora de loja só vê transferências IN_TRANSIT cujo destino é a própria loja.
 * Sem `local_padrao_id` não mostra nada (evita vazar entregas de outras lojas por sessão antiga/cadastro incompleto).
 */
export function filtrarRecebimentoPorLoja<T extends { destino_id: string }>(
  transferencias: T[],
  usuario: Usuario | null
): T[] {
  if (!usuario || usuario.perfil !== 'OPERATOR_STORE') {
    return transferencias;
  }
  if (!usuario.local_padrao_id) {
    return [];
  }
  return transferencias.filter((t) => t.destino_id === usuario.local_padrao_id);
}

/**
 * Aceites: operadora da loja vê
 * - AWAITING_ACCEPT em que ela é destino (precisa aceitar);
 * - ACCEPTED em que ela é origem (precisa despachar, ex.: loja → loja).
 * Sem `local_padrao_id` não mostra nada.
 */
export function filtrarAceitesPorOperadorLoja<
  T extends { origem_id: string; destino_id: string; status: string },
>(transferencias: T[], usuario: Usuario | null): T[] {
  if (!usuario || usuario.perfil !== 'OPERATOR_STORE') {
    return transferencias;
  }
  if (!usuario.local_padrao_id) {
    return [];
  }
  const L = usuario.local_padrao_id;
  return transferencias.filter((t) => {
    if (t.status === 'AWAITING_ACCEPT' && t.destino_id === L) return true;
    if (t.status === 'ACCEPTED' && t.origem_id === L) return true;
    return false;
  });
}
