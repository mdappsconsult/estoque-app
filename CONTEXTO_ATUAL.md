# Contexto Atual - Estoque App

## Objetivo
- Controlar fluxo de itens unitários por QR entre indústria e lojas.
- Garantir rastreabilidade completa do item no ciclo: origem -> trânsito -> destino.

## Visão de produto (north star)
- **Missão:** dar à rede o melhor caminho para o produto **entrar certo** na matriz e **seguir a rota até a filial**, com rastreio forte e operação simples na loja.
- **Origem:** sistema criado para necessidade real da empresa; evoluir para **SaaS** e outros segmentos (ex.: farmácias e varejo afim), sem prender o desenho a um único tipo de loja.
- **Venda na loja (direção):** cliente conclui compra com foco em **QR**; o funcionário atua como **conferente** (confirma que está pago / pode entregar), reduzindo gargalo de pagamento e dependência de PDV mal integrado.
- **Fiscal (direção):** entrada de **nota fiscal por imagem** → checagem de qualidade → extração estruturada dos dados → persistência no servidor → uso consistente para **obrigações e planejamento tributário** (pagamento do mínimo legalmente devido com base em dados corretos).
- **Roadmap de intenção (não prioritização técnica):** (1) consolidar logística matriz–filial e QR operacional; (2) camada de venda/checkout por QR + papel de conferência na loja; (3) pipeline fiscal digital (captura → validação → armazenamento → relatórios).

## Perfis e escopo
- `OPERATOR_WAREHOUSE`: operação de indústria.
- `MANAGER`: visão operacional/gerencial.
- `OPERATOR_STORE`: operação da loja vinculada em `local_padrao_id`.
- `DRIVER` / `OPERATOR_WAREHOUSE_DRIVER`: transporte e viagem.

## Usuários operacionais
- Tela `/login` **não** exibe lista de usuários/senhas (credenciais em `acesso.ts` + `README` para uso interno).
- Leonardo: operador indústria.
- Ludmilla: gerente.
- Joana: operadora de loja (Loja Paraiso).
- Simone: operadora de loja (Loja Teste); login `simone` / senha `123456` (credencial em `acesso.ts`).
- Operadoras de loja (senhas numéricas 6 dígitos **distintas**, ver README): Luciene / `382941` / `Loja JK`; Francisca / `574028` / `Loja Delivery`; Júlia / `619357` / `Loja Santa Cruz`; Lara / `805426` / `Loja Imperador Lara`; Silvania / `973518` / `Loja Jardim Paraíso` (logins `luciene`, `francisca`, `julia`, `lara`, `silvania`). **Locais** com nome idêntico ao cadastro ou o login falha ao resolver loja.
- Marco: administrador.

## Fluxo oficial de transferência
- `AWAITING_ACCEPT` -> `ACCEPTED` -> `IN_TRANSIT` -> `DELIVERED` (ou `DIVERGENCE`).
- Recebimento só lista transferências `IN_TRANSIT` para a loja do usuário (`OPERATOR_STORE`).

## Regras importantes ativas
- Operador de loja vê somente dados da própria loja em recebimento/aceites/estoque/validades.
- Tela **Estoque** (`OPERATOR_STORE`): consulta ao resumo SQL **só** com `local_id = local_padrao_id` da loja; **não** há seletor “Todos os locais” nem RPC com `p_local_id` nulo (evita vazar indústria/consolidado). Escopo da loja usa `usuario` do hook **ou**, na primeira pintura, `getUsuarioLogado()` — evita chamar a RPC antes do `useAuth` hidratar (corrida que mostrava consolidado e sumia ao trocar filtro de estado). Respostas assíncronas defasadas são ignoradas (gerador de fetch). Sem `local_padrao_id`, lista vazia + aviso para cadastrar loja e relogar.
- Sessão de usuário é revalidada com o banco ao carregar o app (corrige `local_padrao_id` desatualizado no navegador).
- Login operacional de `OPERATOR_STORE` não reutiliza `local_padrao_id` antigo quando a loja padrão não é resolvida.
- Atualização de estoque agregado usa `upsert` com conflito em `produto_id` (evita erro de chave única duplicada).
- Estoque ganhou modo gerencial "Visão do dono" (ADMIN_MASTER/MANAGER) com consolidado por unidade (lojas + indústria), totais por local e distribuição por produto.
- Baixa diária possui proteção contra leituras duplicadas da câmera e passa a resolver código escaneado por token completo/curto.
- Baixa diária: leitor de QR **desligado** até o usuário tocar em **Ativar leitor de QR (câmera)**; digitação manual continua sob demanda (botão).
- Padrão de UX de QR: **sem** abrir câmera automaticamente; botão para ativar o leitor + digitação manual sob demanda em recebimento, separar por loja, `/qrcode` e rastreio por QR.
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
- **Declarar estoque na loja** (`/contagem-loja`, operador de loja): mesma lista elegível que **Reposição de estoque por loja**; `ensureTodosProdutosElegiveisNaLoja` ao carregar. **UI só para o funcionário:** produto + **quantidade que tem** (sem exibir mínimo nem faltante — isso fica com estoque/indústria em cadastro e em **Separar por Loja**). Grava `loja_contagens`.
- **Ciclo operacional do QR (matriz → loja):** o cadastro de **produto** não implica etiqueta física; unidades entram com token em **compra/produção**. Na prática, **etiquetas com QR** são geradas na **separação para a loja** (impressão 60×30), coladas no pacote e enviadas; na loja o recebimento lê esse QR. Scanner/digitação em separação manual serve sobretudo quando a unidade **já** tem QR legível (ex.: reimpressão, conferência).
- `Separar por Loja` — **modo reposição:** ao definir origem e destino, carrega faltantes e **aplica sugestão** automaticamente (debounce ~450 ms; troca de loja/indústria refaz o fluxo). Botão **Recarregar faltantes e sugestão** força nova leitura. **Modo manual:** lista **estoque na origem** via `resumo_estoque_agrupado` (filtro + tabela produto/qtd livre + adicionar unidades em FEFO por `created_at`); **opcional** leitor QR / digitação de token (oculto na reposição). Controle de concorrência por epoch evita estado inconsistente ao trocar selects rápido.
- No modo reposição de `Separar por Loja`, a lista exibe apenas produtos com faltante (`mínimo_loja > contagem`), reduzindo ruído operacional.
- `Separar por Loja`: **fluxo recomendado** — **Criar separação** e, em seguida, imprimir quando o sistema perguntar (snapshot dos mesmos `item_id` da transferência, lote `SEP-{viagem}`). **Guia PDF** e **Só imprimir** antes da separação exigem `confirm` explicando risco de QR recusado no recebimento se a lista divergir. **Gravação `etiquetas`:** id = id do item; impressão pós-separação = `impresso_agora` + lote `SEP-…`; impressão antecipada = lote `SEPARACAO-LOJA`; ao criar viagem antes (upsert `manter_impressa_se_existir`) lote `SEP-…` sem zerar `impressa` se já true. Validade ausente: sentinela `2999-12-31`. Limpeza em massa de `etiquetas` no Supabase **não remove** `itens`.
- **Guia PDF + etiquetas** em `Separar por Loja`: PDF + janela de impressão em **60×30** (fluxo operacional); texto de confirmação alinhado a esse formato.
- **Recebimento:** se o QR resolve um item fora de `transferencia_itens`, mensagem orienta conferir remessa e alinhamento com a separação registrada.
- Tela **Etiquetas** (`/etiquetas`): carrega no máximo as **5000 etiquetas mais recentes**; `useRealtimeQuery` aceita `maxRows` e `refetchDebounceMs` para não travar com tabelas enormes nem loop de refetch (transform estável com `useCallback`); join com `itens` em lotes.
- Impressão de etiquetas (`label-print`): **Separar por Loja** e **Produção** usam sempre **60×30** (2 QR por folha), **sem** ler o formato salvo na tela Etiquetas (`FORMATO_ETIQUETA_FLUXO_OPERACIONAL`). QR gerado **no browser** (`qrcode`, data URL), sem `api.qrserver.com`. **Etiquetas** (tela) segue o formato escolhido no seletor + `localStorage`. Layout 60×30: **table/table-cell**, metades em **mm**, borda pontilhada; campos: loja/local, produto, QR, data. **Zebra:** ver `docs/IMPRESSAO_TERMICA_ZEBRA.md`.
- **Raspberry Pi (rede local, usuário `kim`):** serviço **systemd** `pi-print-ws` em `~/pi-print-ws` — WebSocket **TCP 8765**, HTML → PDF (Chromium / **puppeteer-core**, `preferCSSPageSize`) → **`lp`** (CUPS). `.env` no Pi: `PRINT_WS_TOKEN`, **`CUPS_QUEUE=ZebraZD220`**. **Zebra ZD220** USB. **Túnel Cloudflare quick:** **`cloudflared-pi-print-ws`** + **`cloudflared-quick-tunnel-sync.sh`** — atualiza **`ws_public_url`** no Supabase via RPC **`sync_pi_tunnel_ws_url`** (**`PI_TUNNEL_SYNC_SECRET`**, retentativas; sem colar URL no app); hostname quick **muda** a cada reinício (limitação Cloudflare). **URL fixa em produção:** túnel **nomeado** Zero Trust — **`docs/TUNEL_PERMANENTE_PRINT_PI.md`**. Segundo Pi: **`PI_TUNNEL_PAPEL=industria`**. **App:** `NEXT_PUBLIC_PI_PRINT_WS_URL` (dev) ou **`config_impressao_pi`**. **Configurações → Impressoras (Pi)**. Scripts: `scripts/pi-print-ws/`. Docs: `docs/IMPRESSAO_PI_ACESSO_REMOTO.md`, **`docs/RASPBERRY_INDUSTRIA_NOVO_PI.md`**. Migração **`20260406120000_config_impressao_pi_papel.sql`**.
- **“Offline / fetch failed” em Verificar agora:** não é teste da USB da Zebra — é o **servidor do app** (Railway ou `next dev`) chamando `GET https://…/health` no host do **túnel** lido do Supabase. **`ENOTFOUND …trycloudflare.com`** = hostname do túnel **quick** expirou/mudou após reinício do `cloudflared`; atualizar **`ws_public_url`** ou sync no Pi. Em **localhost** usa o mesmo registro do Supabase que produção. Tela **Impressoras (Pi)** mostra bloco de ajuda quando detecta ENOTFOUND. Deploy Railway: ver `docs/FLUXO_ENTREGA.md` (tempo de build; evitar `push` + `railway up` em sequência).
- Rota **`/teste-impressao-etiqueta`**: amostra fictícia; **`?papel=industria`** testa a segunda ponte; padrão **estoque**. Permissões iguais a **Etiquetas**.
- **Hospedagem:** app Next.js em **Railway** com build **Railpack** (sem Docker no repo). Variáveis `NEXT_PUBLIC_SUPABASE_*` no build e runtime. Um único gatilho por mudança: push **ou** `npm run railway:release` — não os dois em sequência. Vários **`QUEUED`**: **`RAILWAY_TOKEN` + `npm run railway:prune-queued`** (API `deploymentCancel`; ver `docs/FLUXO_ENTREGA.md`). Diagnóstico: **`npm run railway:diagnose`**; deploys Docker presos: cancelar no dashboard.
- **Fluxo de entrega:** ver `docs/FLUXO_ENTREGA.md`. **GitHub Actions** (`CI`) em push/PR para `main` executa `npm ci` + **`npm run lint`** + `npm run build` (env Supabase fictícia no runner). Node **20** (`.nvmrc`). Template de PR com checklist.
- **Supabase (um banco):** app e MCP usam o mesmo projeto; `npm run sync:mcp-supabase` alinha `~/.cursor/supabase-mcp.env` ao `.env.local` (reiniciar MCP no Cursor). `npm run env:supabase-ref` mostra o ref. Doc: `docs/SUPABASE_AMBIENTE_E_MCP.md`; SQL: `docs/consultas-sql/estoque-por-loja.sql`.

## Situação validada recente
- Transferência para Loja Paraiso foi recebida e concluída com itens movidos para destino.
- Joana está vinculada no banco à Loja Paraiso.
- Após deploy/migração: aplicar `20260402140000_familias_grupos_embalagem_canonica.sql` no Supabase se o projeto ainda não tiver família/`grupos` canônicos. **`config_impressao_pi` com `papel`:** migração `20260406120000` (duas linhas; segredo de sync distinto por Pi).
