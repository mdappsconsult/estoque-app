/**
 * Critério para sequência numérica de baldes (indústria → loja).
 * Produto cujo nome contém **balde** (case insensitive) entra na sequência por loja.
 */
export function produtoParticipaSequenciaBaldeLoja(p: { nome: string; origem?: 'COMPRA' | 'PRODUCAO' | 'AMBOS' }): boolean {
  return /\bbalde\b/i.test(String(p.nome || ''));
}
