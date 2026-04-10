import { Usuario } from '@/types/database';

/** Escopo da tela Validades: loja, indústria (local padrão) ou visão consolidada (gerência). */
export type EscopoValidades =
  | { tipo: 'local'; localId: string; contexto: 'loja' | 'industria' }
  | { tipo: 'todos_locais' }
  | { tipo: 'indisponivel'; mensagem: string };

/**
 * Define qual `local_atual_id` filtra itens em validade — ou todos os locais para dono/gerente.
 */
export function escopoValidadesPorPerfil(usuario: Usuario | null): EscopoValidades {
  if (!usuario) {
    return { tipo: 'indisponivel', mensagem: '' };
  }
  const p = usuario.perfil;
  if (p === 'OPERATOR_STORE') {
    if (!usuario.local_padrao_id) {
      return {
        tipo: 'indisponivel',
        mensagem:
          'Sem loja vinculada ao usuário. Cadastre a loja em Usuários e entre de novo.',
      };
    }
    return { tipo: 'local', localId: usuario.local_padrao_id, contexto: 'loja' };
  }
  if (p === 'OPERATOR_WAREHOUSE' || p === 'OPERATOR_WAREHOUSE_DRIVER') {
    if (!usuario.local_padrao_id) {
      return {
        tipo: 'indisponivel',
        mensagem:
          'Sem local da indústria vinculado ao usuário. Cadastre o local padrão em Usuários e entre de novo.',
      };
    }
    return { tipo: 'local', localId: usuario.local_padrao_id, contexto: 'industria' };
  }
  if (p === 'MANAGER' || p === 'ADMIN_MASTER') {
    return { tipo: 'todos_locais' };
  }
  return {
    tipo: 'indisponivel',
    mensagem: 'Seu perfil não pode consultar validades nesta tela.',
  };
}

/**
 * UUID da loja (`STORE`) quando o usuário é operador de loja com `local_padrao_id`.
 * Usado para escopo único em estoque, recebimento, validades etc. — nunca listar indústria/outras lojas.
 */
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
 * Matriz → loja em **ACCEPTED** (viagem aceita pelo motorista) ainda sem **IN_TRANSIT** —
 * aparece na loja só como aviso até alguém tocar em «Iniciar viagem» em Viagem / Aceite.
 */
export function filtrarRemessasMatrizAguardandoMotorista<
  T extends { destino_id: string; status: string; tipo: string },
>(transferencias: T[], usuario: Usuario | null): T[] {
  if (!usuario || usuario.perfil !== 'OPERATOR_STORE' || !usuario.local_padrao_id) {
    return [];
  }
  const L = usuario.local_padrao_id;
  return transferencias.filter(
    (t) =>
      t.tipo === 'WAREHOUSE_STORE' &&
      t.destino_id === L &&
      t.status === 'ACCEPTED'
  );
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
