# Log de Sessões

## 2026-03-31

### Sessão - 2026-03-31 14:51:34 -0300 - Validade opcional para produto sem vencimento
- `Registrar Compra` passou a exigir data de validade somente quando o produto possui regra de vencimento no cadastro (`validade_dias/horas/minutos > 0`).
- Para produto sem vencimento, o campo de validade fica opcional e os itens são criados com `data_validade = null`.
- Service de lote (`criarLoteCompra`) foi blindado com a mesma regra para evitar inconsistência entre front e backend.
- Tela de etiquetas foi ajustada para exibir "Sem validade" em produtos não perecíveis.

### Validação feita
- Linter sem erros em `src/app/entrada-compra/page.tsx`, `src/lib/services/lotes-compra.ts` e `src/app/etiquetas/page.tsx`.

## 2026-03-26

### Sessão - 2026-03-26 11:38:42 -0300 - Edição rápida de produto no Registrar Compra
- Adicionado botão "Editar produto selecionado" na tela `Registrar Compra`.
- Modal de produto passou a operar em dois modos no fluxo de compra:
  - criação rápida de novo produto de fornecedor;
  - edição rápida do produto já selecionado.
- Edição permite ajustar nome, unidade, fornecedor preferencial, estoque mínimo e custo de referência sem sair da compra.
- Após salvar edição, produto segue selecionado e campos da compra são recalculados automaticamente.

### Validação feita
- Linter sem erros em `src/app/entrada-compra/page.tsx`.

### Sessão - 2026-03-26 11:36:26 -0300 - Compra por unidade/caixa/fardo
- Atualizado `Registrar Compra` para permitir tipo de compra: `Unidade`, `Caixa` e `Fardo`.
- Adicionado campo de conversão (`unidades por embalagem`) para caixa/fardo.
- Fluxo agora calcula automaticamente:
  - quantidade unitária (itens com QR gerados);
  - custo unitário final usado no lote e no custo de referência.
- Confirmação da compra passou a mostrar resumo da conversão e custo unitário calculado.
- Impacto: operador pode lançar compra por embalagem sem perder rastreabilidade unitária no estoque.

### Validação feita
- Linter sem erros em `src/app/entrada-compra/page.tsx`.

## 2026-03-25

### Sessão - 2026-03-25 12:36:46 -0300 - Revisão mobile-first (passo 1)
- Ajustado layout responsivo em `entrada-compra` (grids `2 col` passaram para `1 col` no mobile).
- `cadastros/produtos` recebeu melhorias mobile: cabeçalho empilhável, filtros full width no celular e tabela com `overflow-x-auto`.
- `relatorios` com tabela larga protegida por scroll horizontal no mobile.
- `etiquetas` com cabeçalho, ações e linhas de grupo adaptados para empilhamento e quebra em telas estreitas.
- `estoque` teve ajuste no campo de busca para evitar largura mínima rígida no mobile.

### Validação feita
- Linter sem erros nos arquivos alterados.
- Checagem no browser mostrou restrição de acesso para validar telas administrativas com usuário de loja; validação visual completa depende de login gerente/admin.

### Sessão - 2026-03-25 12:33:13 -0300 - Padronização de textos em fluxos QR
- Padronizados textos de ação e erro nas telas com leitura QR (`baixa-diaria`, `recebimento`, `separar-por-loja`, `qrcode`, `rastreio-qr`).
- Mensagens de "item não encontrado" e "falha ao buscar" unificadas para reduzir ambiguidade operacional.
- Placeholders de entrada manual padronizados para aceitar QR completo ou token curto.
- Botão da câmera padronizado para "Escanear com câmera" nesses fluxos.

### Validação feita
- Linter sem erros em todos os arquivos alterados de páginas QR.

### Sessão - 2026-03-25 12:31:17 -0300 - Replicação do padrão QR (câmera automática + manual opcional)
- Fluxo de QR replicado para `recebimento`, `separar-por-loja`, `qrcode` e `rastreio-qr`.
- Em todas essas telas: câmera abre automaticamente e a digitação manual fica escondida atrás do botão "Não conseguiu ler? Digitar código".
- Mantida opção de fechar a digitação manual sem encerrar a câmera.
- `qrcode` e `rastreio-qr` passaram a buscar item por código escaneado completo (token QR + token curto), alinhando comportamento com operação.

### Validação feita
- Linter sem erros nas telas alteradas.
- Verificação visual no browser em `qrcode` confirmou câmera autoaberta e botão de digitação manual.

### Sessão - 2026-03-25 12:19:24 -0300 - UX de câmera automática na baixa diária
- `QRScanner` ganhou suporte a abertura automática (uma vez) via prop `autoOpen`.
- Aplicado em `Baixa Diária`: câmera abre automaticamente ao entrar na tela (com local padrão válido).
- Entrada manual deixou de ficar exposta por padrão e passou para fluxo opcional: botão "Não conseguiu ler? Digitar código".
- Incluída opção para fechar a digitação manual sem sair da câmera.

### Validação feita
- Linter sem erros em `src/components/QRScanner.tsx` e `src/app/baixa-diaria/page.tsx`.

### Sessão - 2026-03-25 12:15:43 -0300 - Ajuste de leitura duplicada na baixa diária
- Corrigido fluxo de leitura em `Baixa Diária` para evitar múltiplos disparos do mesmo QR em sequência curta da câmera.
- Baixa passou a usar resolução por código escaneado (token completo + token curto), reduzindo "Não encontrado" falso.
- Incluída trava de item já baixado na sessão para evitar repetição operacional sem necessidade.
- Impacto: reduz registros de erro repetidos (`?`/item fora de estoque) para a mesma etiqueta na mesma ação.

### Validação feita
- Linter sem erros em `src/app/baixa-diaria/page.tsx`.

### Sessão - 2026-03-25 12:14:12 -0300 - Visão gerencial de estoque por unidade
- Implementado seletor de modo na tela de estoque: "Visão operacional" e "Visão do dono".
- Novo modo disponível para `ADMIN_MASTER` e `MANAGER`, com consolidado por local (lojas + indústria).
- Cada unidade exibe: tipo do local, total de itens, quantidade de produtos distintos, próxima validade e distribuição por produto.
- Mantidos filtros já existentes (busca, local, estado) para leitura executiva do estoque.

### Validação feita
- Linter sem erros em `src/app/estoque/page.tsx`.
- Teste visual em sessão de operadora confirmou manutenção do escopo restrito da loja (sem regressão para Joana).

### Sessão - 2026-03-25 12:10:14 -0300 - Fix duplicate key em estoque
- Corrigido `upsert` da tabela `estoque` para conflitar por `produto_id` (antes podia tentar inserir duplicado).
- Ajuste aplicado em três fluxos: transferência (`sincronizarEstoquePorProdutos`), entrada/saída de estoque e contagem.
- Impacto: remove erro `duplicate key value violates unique constraint "estoque_produto_id_key"` no recebimento e evita recorrência em outros fluxos.

### Validação feita
- Linter verificado sem erros em `src/lib/services/transferencias.ts`, `src/lib/services/estoque.ts` e `src/lib/services/contagem.ts`.

### Sessão - 2026-03-25 12:08:04 -0300 - Correção de escopo da operadora de loja (Joana)
- Ajustado login operacional para `OPERATOR_STORE` não reaproveitar `local_padrao_id` antigo do cadastro.
- Busca da loja padrão por nome ficou mais robusta (inclui fallback com normalização de acentos/espaços).
- `useAuth` passou a revalidar usuário no banco ao iniciar app e atualizar `localStorage` com dados correntes.
- Impacto: Joana deixa de visualizar entrega de loja incorreta quando havia sessão/cache desatualizado.

### Validação feita
- Linter verificado sem erros em `src/lib/services/acesso.ts` e `src/hooks/useAuth.ts`.

### Sessão - Ajustes operacionais de transferência e recebimento
- Padronizado texto de transferências em trânsito com origem -> destino, quantidade e data/hora.
- Histórico de viagens passou a exibir lojas destino e total de itens.
- Joana corrigida para Loja Paraiso no banco e no login operacional.
- Corrigida inconsistência de status (viagem em trânsito com transferência pendente).
- Recebimento ganhou:
  - itens esperados da transferência;
  - marcador pendente/escaneado;
  - contagem de faltantes;
  - bloqueio de item fora da transferência;
  - bloqueio de scan duplicado.
- Adicionadas confirmações nos botões principais operacionais.
- Sincronização do estoque agregado implementada no despacho e recebimento.

### Validação feita
- Consulta SQL confirmou transferência entregue para Loja Paraiso com itens em `EM_ESTOQUE` no destino.
