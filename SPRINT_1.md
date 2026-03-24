# Sprint 1 - Blindagem Operacional

Objetivo da sprint:

- reforcar regras criticas no dominio para reduzir dependencia de validacao de tela
- diminuir risco de inconsistencias operacionais

## Escopo

1. Reforco de regras de transferencia e viagem no service layer
2. Reforco de regras de baixa/perda por local
3. Tirar regra critica de producao da tela e centralizar em service
4. Validacoes basicas de entrada de compra no service

## Entregas desta rodada

- [x] `src/lib/services/transferencias.ts`
  - validar itens na criacao de transferencia
  - bloquear aceite fora do status correto
  - bloquear despacho sem aceite
  - bloquear recebimento fora do local/status esperado

- [x] `src/lib/services/viagens.ts`
  - bloquear aceite fora de `PENDING`
  - bloquear inicio fora de `ACCEPTED`
  - permitir inicio apenas ao motorista que aceitou

- [x] `src/lib/services/itens.ts`
  - descarte agora valida local do item

- [x] `src/lib/services/producao.ts` (novo)
  - caso de uso unico para registrar producao + itens + auditoria

- [x] `src/app/producao/page.tsx`
  - tela passa a usar service de dominio

- [x] `src/lib/services/lotes-compra.ts`
  - validar quantidade e custo antes de registrar lote

## Proximos passos da Sprint 1

- [ ] endurecer autorizacao por perfil/local no backend (RLS por papel)
- [ ] padronizar erros de dominio (mensagens e codigos)
- [ ] revisar pontos com escrita direta em tela e mover para services
