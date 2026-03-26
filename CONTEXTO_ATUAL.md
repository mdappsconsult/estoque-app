# Contexto Atual - Estoque App

## Objetivo
- Controlar fluxo de itens unitários por QR entre indústria e lojas.
- Garantir rastreabilidade completa do item no ciclo: origem -> trânsito -> destino.

## Perfis e escopo
- `OPERATOR_WAREHOUSE`: operação de indústria.
- `MANAGER`: visão operacional/gerencial.
- `OPERATOR_STORE`: operação da loja vinculada em `local_padrao_id`.
- `DRIVER` / `OPERATOR_WAREHOUSE_DRIVER`: transporte e viagem.

## Usuários operacionais
- Leonardo: operador indústria.
- Ludmilla: gerente.
- Joana: operadora de loja (Loja Paraiso).
- Marco: administrador.

## Fluxo oficial de transferência
- `AWAITING_ACCEPT` -> `ACCEPTED` -> `IN_TRANSIT` -> `DELIVERED` (ou `DIVERGENCE`).
- Recebimento só lista transferências `IN_TRANSIT` para a loja do usuário (`OPERATOR_STORE`).

## Regras importantes ativas
- Operador de loja vê somente dados da própria loja em recebimento/aceites/estoque/validades.
- Sessão de usuário é revalidada com o banco ao carregar o app (corrige `local_padrao_id` desatualizado no navegador).
- Login operacional de `OPERATOR_STORE` não reutiliza `local_padrao_id` antigo quando a loja padrão não é resolvida.
- Atualização de estoque agregado usa `upsert` com conflito em `produto_id` (evita erro de chave única duplicada).
- Estoque ganhou modo gerencial "Visão do dono" (ADMIN_MASTER/MANAGER) com consolidado por unidade (lojas + indústria), totais por local e distribuição por produto.
- Baixa diária possui proteção contra leituras duplicadas da câmera e passa a resolver código escaneado por token completo/curto.
- Baixa diária abre câmera automaticamente ao entrar na tela (quando usuário tem local padrão) e mantém digitação manual opcional via botão.
- Padrão de UX de QR replicado: câmera autoaberta + digitação manual sob demanda (botão) em recebimento, separar por loja, scanner QR e rastreio por QR.
- Textos de UX/erro de QR padronizados nas telas operacionais (mensagens de não encontrado, falha de busca e placeholders de digitação manual).
- Ajustes mobile-first aplicados em telas administrativas com formulários/tabelas (quebra responsiva de grids, cabeçalhos e scroll horizontal controlado em tabelas largas).
- Registrar Compra suporta lançamento por `Unidade`, `Caixa` e `Fardo`, com conversão automática para itens unitários (QR) e custo unitário.
- Registrar Compra permite edição rápida do produto selecionado sem sair da tela (nome, unidade, fornecedor, estoque mínimo e custo de referência).
- Em recebimento:
  - lista de itens esperados;
  - marcação pendente/escaneado;
  - bloqueio de QR fora da transferência;
  - proteção contra scan duplicado.
- Confirmação (`window.confirm`) nos principais botões operacionais.
- Sincronização de estoque agregado (`estoque`) no despacho e no recebimento via recálculo por produto.

## Situação validada recente
- Transferência para Loja Paraiso foi recebida e concluída com itens movidos para destino.
- Joana está vinculada no banco à Loja Paraiso.
