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
- Validade em compra é opcional para produto sem regra de vencimento no cadastro (validade zerada), e obrigatória apenas para produto perecível.
- Em recebimento:
  - lista de itens esperados;
  - marcação pendente/escaneado;
  - bloqueio de QR fora da transferência;
  - proteção contra scan duplicado.
- Confirmação (`window.confirm`) nos principais botões operacionais.
- Sincronização de estoque agregado (`estoque`) via recálculo por produto nos fluxos de despacho, recebimento, entrada de compra, produção, baixa diária e descarte.
- Reconciliação SQL do agregado `estoque` com base em `itens` (`estado = EM_ESTOQUE`) executada para eliminar divergências históricas de quantidade.
- Hook de consulta em tempo real (`useRealtimeQuery`) passou a paginar automaticamente para não truncar tabelas grandes (evita sumiço de produtos na tela de estoque quando há muitos itens).
- Tela de estoque otimizada para performance: filtros de `estado` e `local` são aplicados na consulta Supabase (server-side), com payload reduzido e paginação maior por lote.
- Paginação do `useRealtimeQuery` foi estabilizada para bases grandes com `count exact` + páginas de até 1000 registros, evitando truncamento silencioso por limite da API.
- Tela `Estoque` usa ordenação estável por `id` na consulta paginada para não perder/duplicar itens entre páginas.
- `useRealtimeQuery` ganhou deduplicação de fetch em voo + paralelismo controlado de páginas (batch) para reduzir tempo de carregamento inicial em tabelas volumosas.
- Tela `Estoque` passou a usar resumo agregado no banco (`resumo_estoque_agrupado`) em vez de carregar todos os itens no front, mantendo busca/filtros e reduzindo drasticamente o payload inicial.
- Tela `Estoque` ganhou aba `Estoque mínimo`, baseada em função SQL agregada (`resumo_estoque_minimo`), com foco em itens abaixo do mínimo para apoiar compra/reposição.
- A aba `Estoque mínimo` considera produtos ativos com `estoque_minimo > 0`, incluindo cenários de saldo zero por local (faltante calculado no banco).
- **Família do produto** (antiga “categoria” de negócio): tabela `familias`, coluna `produtos.familia_id`. Cadastro em `Cadastros -> Categorias` (CRUD em `familias`; exclusão bloqueada se houver produtos).
- **Tipo de embalagem**: tabela legada `grupos` + vínculo `produto_grupos` (somente embalagem). Cadastro em `Cadastros -> Tipos de embalagem` (CRUD em `grupos`; exclusão bloqueada se houver `produto_grupos`).
- Migração `20260402140000_familias_grupos_embalagem_canonica.sql`: cria `familias`, preenche `familia_id` a partir de vínculos antigos de família em `produto_grupos`, unifica `tipos_embalagem` em `grupos`, move `embalagem_tipo_id` para `produto_grupos`, remove `tipos_embalagem` e coluna `embalagem_tipo_id`.
- `Registrar Compra` (modal rápido): família em `familias` (criar/editar no modal); tipo de embalagem em `grupos` (criar/editar no modal); produto grava `familia_id` e até um `grupo_id` em `produto_grupos`.
- `ProdutoModal` e lista de produtos: família + embalagem separados conforme modelo acima (indústria exige família).
- **Reposição de estoque por loja** (`Cadastros`): elegíveis = **COMPRA** (sempre); **AMBOS** só com `escopo_reposicao = loja` (cadastro fornecedor); **PRODUCAO** **nunca** entra (indústria). `escopo industria` exclui sempre. Lista usa `select *` em `produtos`. Migrações: `20260402150000` (coluna + backfill PRODUCAO); `20260402180000` (COMPRA com escopo errado → loja); `20260402181000` (AMBOS indústria com validade preenchida e escopo loja → industria). **Contagem da loja** e **Separar por Loja** (reposição) usam o mesmo critério em `participaReposicaoLoja`. `loja_produtos_config` **paginada**; **Salvar** com `confirm`.
- Operadora de loja ganhou tela `Contagem da Loja` para enviar quantidade atual dos produtos ativos da sua unidade.
- `Separar por Loja` ganhou modo de reposição automática: cruza contagem da loja vs mínimo da loja, sugere faltantes e permite aplicar seleção automática de itens na origem.
- No modo reposição de `Separar por Loja`, a lista exibe apenas produtos com faltante (`mínimo_loja > contagem`), reduzindo ruído operacional.
- `Separar por Loja` passou a permitir impressão de etiquetas dos itens separados (token QR/short) antes de fechar a transferência.

## Situação validada recente
- Transferência para Loja Paraiso foi recebida e concluída com itens movidos para destino.
- Joana está vinculada no banco à Loja Paraiso.
- Após deploy/migração: aplicar `20260402140000_familias_grupos_embalagem_canonica.sql` no Supabase para alinhar o banco ao modelo família/`familias` + embalagem/`grupos`.
