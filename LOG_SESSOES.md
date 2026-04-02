# Log de Sessões

### Sessão - 2026-04-02 - Deploy (push main) — etiquetas operacionais
- Push após correção 60×30 fixo + QR `qrcode`; CI/GitHub Actions e Railway conforme projeto.
- **Validação pré-push:** `npm run build` OK.

### Sessão - 2026-04-02 - Etiquetas: 60×30 fixo na separação/produção + QR local (`qrcode`)
- **Causa:** `localStorage` com formato **60×60** (tela Etiquetas) fazia **Separar por Loja** imprimir legado; QR remoto podia falhar ou sair ilegível na térmica.
- `FORMATO_ETIQUETA_FLUXO_OPERACIONAL`; `imprimirEtiquetasEmJobUnico` **async**, PNG via `qrcode` + `@types/qrcode`; bitmap mínimo ~256px; dependência `qrcode`.
- **Validação:** `npm run build`.

### Sessão - 2026-04-02 - Deploy (push main)
- Commit `9b06390` em `origin/main` (`github.com/mdappsconsult/estoque-app`); **GitHub Actions** CI e deploy **Railway** conforme integração do projeto.
- **Validação pré-push:** `npm run build` OK.

### Sessão - 2026-04-02 - Login: removida lista pública de credenciais
- `/login`: sem bloco “Acessos configurados”; placeholder genérico. Credenciais seguem em `acesso.ts` + README (uso interno).
- **Validação:** `npm run build`.

### Sessão - 2026-04-02 - Credenciais operadoras de loja (senhas 6 dígitos distintas)
- `acesso.ts` / README / CONTEXTO: Luciene `382941` / Loja JK; Francisca `574028` / Loja Delivery; Júlia `619357` / Loja Santa Cruz; Lara `805426` / Loja Imperador Lara; Silvania `973518` / Loja Jardim Paraíso (`OPERATOR_STORE`).
- **Validação:** `npm run build`.

### Sessão - 2026-04-02 - Separar por Loja: reposição automática + scanner só no manual
- **Modo reposição:** `useEffect` com debounce dispara carregar faltantes + aplicar sugestão ao mudar origem/destino; **Recarregar faltantes e sugestão**; epoch (`reposicaoSyncEpoch`) + invalidação ao ir para manual ou ao recarregar.
- **Modo manual:** bloco escanear/digitar só aparece no manual; mensagens de erro comuns abaixo do bloco.
- **Validação:** `npm run build`.

### Sessão - 2026-04-02 - Separar por Loja: aviso quando PDF/etiquetas desativados
- Caixa âmbar explicando que **Guia PDF** e **etiquetas** exigem itens em **Itens separados** (sugestão automática ou scan); ver só faltantes não basta. `title` nos botões.
- **Validação:** `npm run build`.

### Sessão - 2026-04-02 - Separar por Loja: guia PDF + impressão de etiquetas
- Dependências: `jspdf`, `jspdf-autotable`.
- `src/lib/printing/separacao-guia-pdf.ts`: PDF A4 com cabeçalho (origem, destino, responsável, modo), tabela resumo por produto e tabela detalhe por unidade (token curto, QR, validade).
- `separar-por-loja`: botão **Guia PDF + imprimir etiquetas** (confirmação única); **Só imprimir etiquetas** preserva o fluxo antigo; `executarUpsertEAbrirJanelaEtiquetas` compartilhado.
- **Validação:** `npm run build`.

### Sessão - 2026-04-02 - Login: credenciais unificadas em `acesso.ts` + README
- `listarCredenciaisParaTelaLogin()` gera a caixa de “Acessos configurados” em `/login` a partir de `CREDENCIAIS_OPERACIONAIS` (ordem: Leonardo, Joana, Ludmilla, Marco, Simone).
- `README.md`: seção **Acessos de desenvolvimento** com o mesmo resumo.
- **Validação:** `npm run build`.

### Sessão - 2026-04-02 - Usuário operacional Simone (Loja Teste)
- `acesso.ts`: credencial `simone` / `123456`, perfil `OPERATOR_STORE`, telefone `550000000005`, `lojaPadraoNome: Loja Teste` — primeiro login faz upsert em `usuarios` com `local_padrao_id` da loja.
- **Validação:** `npm run build`.

### Sessão - 2026-04-01 - Etiqueta 60×30: QR levemente menor (texto igual)
- `label-print`: `qrSizeMm` **14,5** (antes 16); fontes e margens de texto inalteradas.
- **Validação:** `npx tsc --noEmit`.

### Sessão - 2026-04-01 - Etiqueta 60×30: QR maior até perto da data
- `label-print`: `qrSizeMm` **16** (antes 10,4); margem superior do QR **0,5 mm**; **data** mantém `margin-top: auto` no stack flex.
- **Impacto:** QR ocupa quase todo o espaço entre produto e data; validar corte na Zebra (se estourar, reduzir alguns décimos de mm).
- **Validação:** `npx tsc --noEmit`.

### Sessão - 2026-04-02 - Etiqueta 60×30: mais margem interna + conteúdo menor (anti-corte)
- Padding **2,35 / 0,85 / 0,65 mm**; `qrSizeMm` **10,4**; prod **4,15 mm**; fontes loja/prod/data levemente menores; doc `IMPRESSAO_TERMICA_ZEBRA` nota zona útil.

### Sessão - 2026-04-02 - Etiqueta 60×30: desce bloco (padding-top), QR menor, cabe na etiqueta
- `label-print`: `vertical-align: top`; padding **1,65 / 0,55 mm**; `qrSizeMm` **11,6**; prod **4,55 mm**; margens um pouco menores entre loja/prod/QR.

### Sessão - 2026-04-02 - Etiqueta 60×30: stack flex, meio vertical, data no fundo
- `label-print`: wrapper `.celula-60x30-stack` (flex col, `height: 100%`); célula `vertical-align: middle`; `.cel-data` `margin-top: auto` + `0,1 mm` do fundo; padding vertical reduzido; margem QR um pouco menor.

### Sessão - 2026-04-02 - Etiqueta 60×30: slot fixo 2 linhas no produto + padding topo
- `label-print`: `.cel-prod` altura fixa **4,85 mm** (`-webkit-box-pack: start`); padding topo célula **0,85 mm** — metades esq/dir alinhadas (açaí 2 linhas vs leite 1 linha).

### Sessão - 2026-04-02 - Etiqueta 60×30: alinhamento topo (loja fixa, produto 2 linhas para baixo)
- `label-print`: `.celula-60x30` `vertical-align: top` (antes `middle`); metade vazia continua centralizada.

### Sessão - 2026-04-02 - Etiqueta 60×30: loja maior (fonte)
- `label-print`: `.cel-loja` **6,75 pt**.

### Sessão - 2026-04-02 - Etiqueta 60×30: loja um pouco maior
- `label-print`: `.cel-loja` **5,75 pt** (antes 5,25 pt).

### Sessão - 2026-04-02 - Etiqueta 60×30: espaço loja × produto
- `label-print`: `.cel-loja` margin-bottom **1 mm**; `.cel-prod` margin-top **0,35 mm**.

### Sessão - 2026-04-02 - Etiqueta 60×30: QR −20%, data maior
- `label-print`: `qrSizeMm` **12,48**; data **6 pt**; `max-height` produto **4,5 mm**.

### Sessão - 2026-04-02 - Etiqueta 60×30: data mais forte/menor, QR +20%, checklist “perfeita”
- `label-print`: `qrSizeMm` **15,6**; margem superior do QR **2,2 mm**; produto `max-height` menor; data **4 pt**, **#000**, **900**; `print-color-adjust` na data.
- `IMPRESSAO_TERMICA_ZEBRA.md`: listras verticais (hardware) + checklist impressão perfeita.

### Sessão - 2026-04-02 - Etiqueta 60×30: QR maior e mais afastado do texto
- `label-print`: `qrSizeMm` **13**; margens `.cel-loja` / `.cel-qr` / `.cel-prod` (bloco produto um pouco mais baixo); `margin=2` na API do QR.

### Sessão - 2026-04-02 - Etiqueta 60×30: QR mais nítido para térmica
- `label-print`: `pixelsQrParaImpressao` (mín. 220px, ~22×mm); URL QR com `ecc=M&margin=1`; formato **60×30** com `qrSizeMm` **11**; legado usa mesma lógica de bitmap.
- `IMPRESSAO_TERMICA_ZEBRA.md`: escuridão/velocidade/dither e QR que não lê.
- **Validação:** `npx tsc --noEmit`.

### Sessão - 2026-04-02 - Doc: página de teste Zebra + alinhamento do retângulo
- `IMPRESSAO_TERMICA_ZEBRA.md`: nota sobre **Página de teste** do driver (retângulo de posição) — se sair deslocado, ajustar mídia/offset no driver, não o HTML do app.

### Sessão - 2026-04-02 - Doc: driver Zebra + impressão minúscula no canto
- **`IMPRESSAO_TERMICA_ZEBRA.md`:** seção “Por que sai pequeno no canto” — pipeline GDI/raster, descompasso stock (Letter/A4) vs 60×30, passos ZDesigner (mm, Stocks, DPI, diálogo do sistema); links suporte Zebra.

### Sessão - 2026-04-02 - Etiqueta 60×30: layout table para Zebra
- **`label-print` (60×30):** `folha-60x30`/`celula-60x30` de **flex** para **`display: table` / `table-cell`**, metades com **largura em mm** (`widthMm/2`); QR `display:block` + `margin: auto`; evita conteúdo só no canto (driver térmico).
- **`IMPRESSAO_TERMICA_ZEBRA.md`:** nota sobre table vs flex.

### Sessão - 2026-04-02 - Impressão térmica Zebra (orientação + ajuste HTML)
- **`docs/IMPRESSAO_TERMICA_ZEBRA.md`:** cabeçalhos/rodapés do navegador, margens, escala 100%, calibração ZD220, driver/tamanho 60×30.
- **`label-print`:** `<title>` vazio (evita texto tipo “Impressão (2 etiquetas)” na faixa do Chrome); `@media print` reforça margin 0 no `body`.
- Tela teste: aviso térmica + caminho do doc; `README` mapa atualizado.

### Sessão - 2026-04-02 - Fluxo de entrega contínua (CI + doc)
- **`docs/FLUXO_ENTREGA.md`:** fluxo canônico local → CI → Railway → migrations Supabase → CONTEXTO/LOG.
- **`.github/workflows/ci.yml`:** `npm ci` + `npm run build` em push/PR para `main` (env pública Supabase fictícia no job).
- **`.nvmrc`** (20), **`package.json`** `engines` + script `ci`.
- **`README.md`:** seção resumo + mapa apontando `FLUXO_ENTREGA`; **`AGENTS.md`** leitura do fluxo e regra de build.
- **`.github/PULL_REQUEST_TEMPLATE.md`** checklist.
- **Validação:** `npm run build` local; build com env fictícia (simulação CI).

### Sessão - 2026-04-02 - README: deploy explícito (Railway)
- `README.md`: seção **Deploy (produção)** — Railway + Supabase; evita suposição de outro host (ex.: Vercel) sem doc.

### Sessão - 2026-04-01 - Teste de impressão de etiqueta (impressora física)
- `label-print.ts`: `gerarEtiquetasDemonstracaoImpressao` (60×30 com 2 amostras; legado com 1).
- Nova rota `/teste-impressao-etiqueta` + link em **Etiquetas**; `ROUTE_PERMISSIONS` / `ROUTE_UI_META`.
- **Validação:** `npx tsc --noEmit`.

### Sessão - 2026-04-01 - Separar por Loja: upsert em `etiquetas` + orientação para zerar tabela
- **`etiquetas.ts`:** `upsertEtiquetasSeparacaoLoja` (chunks) — impressão marca `impressa`; criação de separação preserva `impressa` existente; `excluida: false`; validade sentinela alinhada à compra.
- **`separar-por-loja`:** chama upsert antes da janela de impressão e após `criarViagem` (lote `SEP-{viagem.id}`); texto curto na UI sobre persistência.
- **Operação:** `DELETE`/limpar `etiquetas` no Supabase não apaga `itens` nem estoque agregado; novas linhas voltam conforme impressão/separação.
- **Validação:** `npx tsc --noEmit`.

### Sessão - 2026-04-01 - Etiquetas 60×30 mm: 2 QR por folha + dados mínimos
- `label-print.ts`: novo formato **60x30** (padrão): duas metades por página, divisor **pontilhado** (`border-left` na coluna direita); cada metade: loja/local, produto, QR, data gerada. `EtiquetaParaImpressao` ganha `nomeLoja` e `dataGeracaoIso`. Emparelhamento de itens + `confirmarImpressao` informa folhas físicas.
- **Separar por Loja:** `nomeLoja` = loja destino selecionada. **Produção:** `nomeLoja` = local da produção. **Etiquetas:** `dataGeracaoIso` = `created_at`.
- **Validação:** `npx tsc --noEmit`.

### Sessão - 2026-04-01 - Etiquetas: página travando
- **Causa:** `transform` inline no `useRealtimeQuery` gerava nova função a cada render → `fetchData` mudava → `useEffect` disparava refetch em loop. Tabela grande: `COUNT` + milhares de linhas + `.in('id', ids)` gigante.
- **Hook `useRealtimeQuery`:** opções `maxRows` (busca só N linhas sem contar tabela inteira) e `refetchDebounceMs` (debounce no realtime).
- **`etiquetas`:** `useCallback` no transform; busca de `itens` em lotes de 400; `maxRows: 5000` + debounce 500ms; agrupamento com `Map` + `useMemo`; aviso na UI sobre limite das mais recentes.
- **Validação:** `npx tsc --noEmit`.

### Sessão - 2026-04-01 - Declarar estoque: sem mínimo/falta para o funcionário
- `contagem-loja`: remove colunas e textos de **mínimo** e **faltante**; só **produto** + **quantidade que tenho**; sucesso e vazio sem jargão de estoque.

### Sessão - 2026-04-01 - Declarar estoque na loja (fluxo funcionário × reposição)
- `reposicao-loja.ts`: `listarIdsProdutosElegiveisReposicaoLoja` + `ensureTodosProdutosElegiveisNaLoja` para igualar lista ao cadastro de mínimos.
- `contagem-loja`: UX renomeada (título, tabela Mín./Tenho/Falta, links para reposição e Separar por Loja); `ensure` antes de carregar configs.
- Home, Sidebar e `ROUTE_UI_META`: rótulos alinhados. `separar-por-loja` (modo reposição): texto explica origem do mínimo e da contagem.
- **Validação:** `npx tsc --noEmit`.

### Sessão - 2026-04-01 - Deploy (push main)
- Commit `e094ca2`: tratamento de erro em `cadastros/reposicao-loja` + log da sessão de correção Supabase. Push para `origin/main`; build `npm run build` OK antes do commit.

### Sessão - 2026-04-01 - Reposição por loja: falha ao carregar (localhost)
- **Causa:** `getConfigProdutosLoja` faz embed `produtos(..., escopo_reposicao)`. Se a coluna **não existir** no Supabase do `.env.local`, o PostgREST retorna erro e o fluxo ao escolher a loja quebra.
- **Correção no projeto Supabase (MCP):** aplicadas migrations `produtos_escopo_reposicao_loja`, `escopo_loja_origem_compra`, `ambos_industria_validade`. Conferido `escopo_reposicao` em `information_schema.columns`.
- **App:** tela `cadastros/reposicao-loja` passa a exibir erro de `useRealtimeQuery` (locais/produtos) e texto orientando migration se citar `escopo_reposicao`.
- Outro ambiente (URL diferente no `.env.local`): rodar as migrations nesse projeto também.

### Sessão - 2026-04-01 - Deploy (push main)
- `npm run build` concluído com sucesso; commit `7c328b8` em `main` e **push** para `origin` (`github.com/mdappsconsult/estoque-app`). Deploy automático depende do Vercel/Railway (ou outro) ligado ao repositório.
- **Pós-deploy:** aplicar no Supabase as migrations pendentes em `supabase/migrations/` que ainda não rodaram em produção (reposição loja, `escopo_reposicao`, famílias/grupos, etc.).

### Sessão - 2026-04-01 - Reposição: esconder itens de indústria (PRODUCAO / AMBOS)
- `participaReposicaoLoja`: **PRODUCAO** não entra na reposição/contagem/resumo; **AMBOS** só com `escopo_reposicao = loja`; **COMPRA** segue sempre; `industria` exclui primeiro.
- Migration `20260402181000_ambos_industria_validade.sql`: AMBOS com validade (d/h/min) &gt; 0 e escopo loja → `industria` (heurística para cadastro indústria que herdou default loja).
- **Validação:** `npx tsc --noEmit`. Itens AMBOS indústria sem validade no cadastro: abrir produto, **Produto da indústria**, salvar.

### Sessão - 2026-04-01 - Reposição por loja: lista vazia (0 itens)
- Regra `participaReposicaoLoja(escopo, origem)`: **COMPRA** entra sempre; **PRODUCAO** só com `escopo_reposicao = loja`; **AMBOS** entra salvo `escopo_reposicao = industria`. Corrige catálogo com compra marcada como indústria por engano.
- Tela `cadastros/reposicao-loja`: consulta `produtos` com `select *` (evita falha REST se coluna `escopo_reposicao` não existir). Join em `loja_produtos_config` passa a trazer `origem` do produto para o mesmo critério em resumo/contagem.
- Migration `20260402180000_escopo_loja_origem_compra.sql`: `UPDATE` escopo → `loja` onde `origem = COMPRA` e `escopo_reposicao = industria`.
- **Validação:** `npx tsc --noEmit`.

### Sessão - 2026-04-01 - Modal produto: fornecedor (COMPRA/AMBOS) na reposição de loja
- Ao editar produto **sem** `escopo_reposicao` definido, a aba era inferida como indústria para qualquer origem diferente de COMPRA — **AMBOS** (comum em produto de fornecedor) abria como indústria e, ao salvar, gravava `escopo_reposicao = industria`, sumindo da reposição. Ajuste: sem escopo, só **PRODUCAO** abre como indústria; **COMPRA** e **AMBOS** abrem como fornecedor. Texto de ajuda no modal reforça que fornecedor entra na reposição/contagem de loja.
- **Validação:** `npx tsc --noEmit`. Produtos AMBOS já gravados como indústria por engano: editar, escolher **Produto de fornecedor** e salvar.

### Sessão - 2026-04-01 - Reposição de estoque por loja + exclusão de produtos só indústria
- UI renomeada para **Reposição de estoque por loja** (página, home, sidebar, link em Separar por Loja, label em permissões).
- Nova coluna `produtos.escopo_reposicao` (`loja` | `industria`): modal grava conforme “Produto da indústria” vs “Produto de fornecedor”; texto de ajuda no modal. `ensure` / listas filtram só escopo loja; `getResumoReposicaoLoja` e **Contagem da loja** idem.
- Migration `supabase/migrations/20260402150000_produtos_escopo_reposicao_loja.sql`: default `loja`, `UPDATE` para `industria` onde `origem = PRODUCAO`, remoção de linhas órfãs em `loja_produtos_config` e `loja_contagens`.
- **Validação:** `npx tsc --noEmit`. Aplicar a migration no Supabase antes de usar o app em produção.

### Sessão - 2026-04-01 - Validação localhost: Reposição por loja grava no banco
- Teste no browser: Loja Paraiso, mínimo Abacaxí 77→93, **Salvar** + confirm; rede: `GET/POST loja_produtos_config` **200**; após reload UI mostra **93** e botão **Salvar** sem pendências.
- SQL no Supabase (`yvkzjlditimmrwtiogda`): `estoque_minimo_loja = 93` para produto Abacaxí na Loja Paraiso.

### Sessão - 2026-04-01 - Migration reposição aplicada no Supabase (MCP)
- Aplicada via MCP Supabase a migration `ensure_reposicao_loja_tables` (equivalente a `20260401153000_reposicao_loja.sql`): tabelas `loja_produtos_config` e `loja_contagens`, índices, RLS/policies abertas, publicação realtime com `DO` + `duplicate_object` seguro.
- Projeto alvo do MCP: `https://yvkzjlditimmrwtiogda.supabase.co` (mesmo host do app local testado). Antes o REST retornava 404 na tabela por ela não existir no banco.

### Sessão - 2026-04-01 - Reposição por loja: Salvar com confirmação
- `cadastros/reposicao-loja`: campos de mínimo controlados em memória; gravação só pelo botão **Salvar** após `window.confirm` (mensagem com quantidade de alterações e nome da loja). Linhas alteradas destacadas; botão mostra contador e fica desabilitado sem mudanças. Sincronização do estado local amarra a `configs`/`ativosIdsKey` para não zerar edição a cada realtime de `produtos`.

### Sessão - 2026-04-01 - UX Reposição por loja (tabela compacta)
- Lista de mínimos virou tabela com cabeçalho único (Produto | Mín.); campo numérico estreito (`w-14`), sem repetir “Mínimo na loja” por linha; removido `Input` que forçava largura total no wrapper.

### Sessão - 2026-04-01 - Reposição por loja: fim do loading infinito + texto estoquista/pedido
- `getConfigProdutosLoja`: paginação com `.range` (páginas de 1000) para trazer todas as linhas da loja — lojas com muitos produtos deixavam de receber configs além do limite da API e a UI mostrava spinner por linha sem fim.
- `cadastros/reposicao-loja`: `recarregarConfigs` estável (`useRef` + `ativosIdsKey`) para não disparar reload a cada evento realtime em `produtos`; linhas sempre com input de mínimo (gravação por `upsert` no blur, inclusive se a linha ainda não existia).
- Texto da página: papel do estoquista e uso para montar envio ao longo da semana.

### Validação feita
- `npm run build`.

### Sessão - 2026-04-01 - Reposição por loja alinhada ao fluxo Separar por Loja
- Textos em `cadastros/reposicao-loja`: explicam que o mínimo por loja é o piso para reposição e que `Separar por Loja` (modo reposição) cruza esse mínimo com a contagem da loja para saber o que enviar da indústria.
- `separar-por-loja`: bloco curto no modo reposição com link para `Cadastros -> Reposição por loja` e definição de faltante.

### Validação feita
- `npm run build` (após alterações).

### Sessão - 2026-04-01 - Reposição por loja: lista completa + só mínimo
- Tela `cadastros/reposicao-loja`: removidos fluxo de adicionar produto, ativar/desativar e excluir; ao selecionar a loja, todos os produtos ativos aparecem com campo único de mínimo da loja.
- Serviço `ensureTodosProdutosNaLoja` em `src/lib/services/reposicao-loja.ts`: cria em lote (upsert) configurações faltantes com mínimo 0 e `ativo_na_loja` true, idempotente.
- Impacto: Contagem da loja / resumo de reposição passam a incluir todos os produtos ativos da loja (após primeira carga da tela ou equivalente), salvo produtos que estavam só com linha antiga inativa — novas linhas seguem ativas.

### Validação feita
- `npm run build` concluído com sucesso.

### Sessão - 2026-04-01 16:38:09 -0300 - Deploy Railway
- Executado `railway up` no repositório: build/deploy disparado no serviço Next.js do projeto Railway.
- Logs de build: link retornado pelo CLI na execução (dashboard Railway).

### Sessão - 2026-04-02 (correção localhost) - Migration aplicada + aviso de erro nas telas
- Causa: front já usava `familias`/`grupos` novo modelo mas o banco ainda tinha só `tipos_embalagem`, `grupos` vazio e sem tabela `familias` — cadastro de família falhava e embalagens não listavam.
- Migration `20260402140000_familias_grupos_embalagem_canonica.sql` aplicada no projeto Supabase (MCP); pós-execução: `familias` criada, `grupos` populado a partir de `tipos_embalagem`, `tipos_embalagem` removida.
- Ajuste no arquivo da migration: `ADD`/`DROP` na publicação realtime com tratamento seguro; `DROP TABLE IF EXISTS` na publicação (PG15+).
- Telas `cadastros/categorias` e `cadastros/embalagens` passam a exibir banner quando `useRealtimeQuery` retorna erro (orienta rodar migration no Supabase do `.env`).

### Validação feita
- Consulta no banco pós-migration: `familias` acessível, `grupos` com registros de embalagem.

### Sessão - 2026-04-02 - Modelo canônico família (`familias`) vs embalagem (`grupos`)
- Implementada regra de negócio fechada: família do produto em tabela nova `familias` + `produtos.familia_id`; tipo de embalagem na tabela legada `grupos` + `produto_grupos` apenas para embalagem.
- Nova migration `supabase/migrations/20260402140000_familias_grupos_embalagem_canonica.sql`: migra dados, remove `tipos_embalagem` e coluna `produtos.embalagem_tipo_id`.
- App atualizado: `src/types/database.ts`, `src/lib/services/produtos.ts`, `src/components/produtos/ProdutoModal.tsx`, `src/app/cadastros/produtos/page.tsx`, `src/app/cadastros/categorias/page.tsx`, `src/app/cadastros/embalagens/page.tsx`, `src/app/entrada-compra/page.tsx`; `supabase/schema_public.sql` alinhado ao estado pós-migração.

### Validação feita
- `npm run build` concluído com sucesso.
- **Pendente operacional**: rodar a migration no projeto Supabase (local/produção) antes de usar o app contra o banco antigo com `tipos_embalagem`.

### Sessão - 2026-04-01 16:03:26 -0300 - Aplicação local das migrations de tipo de embalagem
- Aplicadas via MCP Supabase as migrations pendentes no banco local:
  - `create_tipos_embalagem`;
  - `migrar_categorias_para_tipos_embalagem_compat`.
- Validado no banco:
  - tabela `tipos_embalagem` disponível para uso;
  - produtos com `embalagem_tipo_id` preenchido via migração assistida.
- Impacto: fluxo do `Registrar Compra` volta a permitir criar/editar tipo de embalagem no localhost sem erro de schema cache.

### Validação feita
- Consulta SQL pós-migração confirmada: `tipos_embalagem = 5` e `produtos com embalagem_tipo_id = 2`.

### Sessão - 2026-04-01 18:10:00 -0300 - Ajuste para compatibilidade total com categorias legadas
- Revisada estratégia para não quebrar fluxos que ainda dependem de `produto_grupos` com categorias de embalagem.
- Removidos bloqueios de criação/edição de categoria por semântica de embalagem em:
  - `src/app/cadastros/categorias/page.tsx`;
  - `src/app/entrada-compra/page.tsx`.
- Removido utilitário de bloqueio `src/lib/domain/classificacao-produto.ts`.
- Mantida abordagem recomendada:
  - `tipos_embalagem` segue disponível para evolução;
  - dados legados de categoria permanecem compatíveis na fase atual.

### Validação feita
- Linter sem erros nos arquivos alterados.

### Sessão - 2026-04-01 17:55:00 -0300 - Blindagem semântica de categoria vs embalagem
- Criado utilitário `src/lib/domain/classificacao-produto.ts` com regra para detectar nomes que parecem tipo de embalagem.
- Aplicada validação de bloqueio na criação/edição de categoria em:
  - `src/app/cadastros/categorias/page.tsx`;
  - `src/app/entrada-compra/page.tsx` (modal rápido).
- Quando o nome parecer embalagem (balde/caixa/pote/saco/fardo/embalagem), o sistema orienta cadastrar em `Tipos de embalagem`.

### Validação feita
- Linter sem erros nos arquivos alterados.

### Sessão - 2026-04-01 17:40:00 -0300 - Migração de dados legados de categoria para tipo de embalagem
- Criada migration `20260401174000_migrar_categorias_para_embalagem.sql` para saneamento dos dados históricos:
  - detecta categorias legadas com semântica de embalagem (`balde`, `caixa`, `pote`, `saco`, `fardo`, `embalagem`);
  - garante criação desses valores em `tipos_embalagem`;
  - preenche `produtos.embalagem_tipo_id` (sem sobrescrever quando já existe valor);
  - remove vínculos dessas categorias de `produto_grupos` para manter categoria como família de produto.

### Validação feita
- Revisão lógica da migration concluída (idempotente com `ON CONFLICT DO NOTHING` e update protegido por `embalagem_tipo_id IS NULL`).

### Sessão - 2026-04-01 17:30:00 -0300 - Ajuste de ordem dos botões no modal rápido de compra
- Ajustado `src/app/entrada-compra/page.tsx` no modal `Novo produto de fornecedor`:
  - botões de categoria (`+ Nova categoria` e `Editar categoria selecionada`) posicionados logo abaixo do select de categoria;
  - botões de tipo de embalagem (`+ Novo tipo de embalagem` e `Editar tipo selecionado`) posicionados logo abaixo do select de tipo de embalagem.
- Objetivo: reforçar visualmente o vínculo de cada botão com seu respectivo campo.

### Validação feita
- Linter sem erros em `src/app/entrada-compra/page.tsx`.

### Sessão - 2026-04-01 17:20:00 -0300 - Gestão rápida de tipo de embalagem no modal de compra
- Ajustado `src/app/entrada-compra/page.tsx` para paridade de UX entre categoria e embalagem:
  - adicionado botão `+ Novo tipo de embalagem`;
  - adicionado botão `Editar tipo selecionado`;
  - adicionado modal rápido de criação/edição em `tipos_embalagem` sem sair de `Registrar Compra`.
- Mantida separação conceitual:
  - `Categoria` continua em `grupos` (família do produto);
  - `Tipo de embalagem` continua em `tipos_embalagem`.

### Validação feita
- Linter sem erros em `src/app/entrada-compra/page.tsx`.

### Sessão - 2026-04-01 17:00:00 -0300 - Separação entre categoria e tipo de embalagem
- Atendida a correção conceitual para evitar mistura de semântica entre `Categoria` e `Caixa/Balde`:
  - `Categoria` mantida como família do produto;
  - criado cadastro separado de `Tipos de embalagem`.
- Migration adicionada: `20260401170000_tipos_embalagem.sql`:
  - nova tabela `tipos_embalagem`;
  - nova coluna `produtos.embalagem_tipo_id` com índice e vínculo.
- Criada tela `Cadastros -> Tipos de embalagem` (`src/app/cadastros/embalagens/page.tsx`) com CRUD e bloqueio de exclusão quando em uso por produtos.
- Atualizadas telas de produto/compra para usar o novo campo:
  - `src/components/produtos/ProdutoModal.tsx` (select de tipo de embalagem);
  - `src/app/cadastros/produtos/page.tsx` (exibição de embalagem por produto);
  - `src/app/entrada-compra/page.tsx` (modal rápido de produto com `Categoria (família)` + `Tipo de embalagem`).
- Navegação/permissões atualizadas com a nova rota:
  - `src/lib/permissions.ts`;
  - `src/components/layout/Sidebar.tsx`;
  - `src/app/page.tsx`.

### Validação feita
- Linter sem erros nos arquivos alterados.

### Sessão - 2026-04-01 15:45:00 -0300 - Separar por loja exibindo apenas faltantes
- Ajustado `src/app/separar-por-loja/page.tsx` no modo reposição para listar apenas produtos com `faltante > 0`.
- Mantido cálculo de disponibilidade na origem e aplicação da sugestão automática sobre os faltantes.
- Adicionada mensagem operacional quando não há faltantes para a loja selecionada.

### Validação feita
- Linter sem erros em `src/app/separar-por-loja/page.tsx`.

### Sessão - 2026-04-01 15:30:00 -0300 - Reposição por loja com contagem e sugestão na separação
- Implementado modelo de dados para reposição por loja:
  - migration `20260401153000_reposicao_loja.sql` com tabelas `loja_produtos_config` e `loja_contagens`;
  - índices, RLS/policies e inclusão no realtime para as novas tabelas.
- Criado service `src/lib/services/reposicao-loja.ts` com:
  - cadastro de produto por loja e mínimo específico;
  - gravação de contagem da loja (upsert por loja/produto);
  - resumo de reposição (mínimo x contagem => faltante).
- Nova tela `Cadastros -> Reposição por Loja` (`src/app/cadastros/reposicao-loja/page.tsx`) para:
  - definir vitrine de produtos por loja;
  - definir mínimo por loja;
  - ativar/desativar e remover vínculo de produto da loja.
- Nova tela `Contagem da Loja` (`src/app/contagem-loja/page.tsx`) para `OPERATOR_STORE` enviar contagem dos produtos ativos da loja.
- `Separar por Loja` (`src/app/separar-por-loja/page.tsx`) evoluído com:
  - modo `Reposição` (carrega faltantes por loja e disponibilidade na origem);
  - botão para aplicar sugestão automática de separação;
  - impressão de etiquetas dos itens separados antes da criação da transferência.
- Atualizadas permissões e navegação:
  - rotas em `src/lib/permissions.ts`;
  - itens no menu em `src/components/layout/Sidebar.tsx`;
  - cartões da home em `src/app/page.tsx`.
- Atualizado `src/types/database.ts` com tipos das novas tabelas.

### Validação feita
- Linter sem erros nos arquivos alterados (telas, services, permissões, sidebar, home e tipos).

### Sessão - 2026-04-01 12:40:02 -0300 - Edição de categoria dentro do modal de compra
- Atendido pedido de UX no `Registrar Compra` > `Novo produto de fornecedor`:
  - adicionado botão `+ Nova categoria`;
  - adicionado botão `Editar categoria selecionada`.
- Ambos abrem modal rápido de categoria sem sair da tela de compra.
- Fluxo implementado:
  - criar categoria nova (salva em `grupos` e já seleciona no produto);
  - renomear categoria atualmente selecionada;
  - validação de nome duplicado (case-insensitive) no front.
- Mantido fluxo padrão de vinculação da categoria em `produto_grupos` ao salvar produto.

### Validação feita
- Linter sem erros em `src/app/entrada-compra/page.tsx`.
- Verificação visual no localhost confirmou presença dos novos botões e abertura do modal de categoria.

### Sessão - 2026-04-01 11:54:11 -0300 - Cadastro central de categorias + bloqueio de criação livre
- Criada a nova tela `Cadastros -> Categorias` (`src/app/cadastros/categorias/page.tsx`) para gestão central de categorias.
- Tela de categorias permite criar, editar e excluir categoria, com proteção:
  - não exclui categoria que já está vinculada a produtos (`produto_grupos`).
- Menu lateral atualizado para incluir `Cadastros -> Categorias`.
- Permissões atualizadas para rota `/cadastros/categorias` (ADMIN_MASTER e MANAGER) e inclusão na matriz de permissões da UI.
- Ajustado `Registrar Compra` (modal de novo produto):
  - removida criação livre de categoria no modal;
  - campo `Categoria` agora é `Select` com categorias cadastradas;
  - orientação visual para cadastrar novas categorias na tela central;
  - criação/edição de produto vincula categoria selecionada em `produto_grupos`.

### Validação feita
- Linter sem erros em arquivos alterados.
- Verificação visual no localhost confirmou:
  - nova tela de categorias com listagem e ações;
  - campo `Categoria` no modal rápido com opções padronizadas.

### Sessão - 2026-04-01 11:49:33 -0300 - Categoria editável no novo produto de fornecedor (Registrar Compra)
- Modal rápido de produto em `Registrar Compra` recebeu novo campo **Categoria** (texto editável com sugestões existentes).
- Campo foi implementado com `datalist` alimentado pela tabela `grupos`, permitindo:
  - selecionar categoria existente;
  - digitar nova categoria livremente.
- Ao criar produto, o fluxo agora:
  - cria a categoria em `grupos` quando não existe;
  - vincula produto e categoria em `produto_grupos`.
- Ao editar produto, quando categoria é informada, o vínculo de grupo do produto é atualizado para a categoria escolhida.
- Mantida a experiência atual de criação/edição rápida sem sair da tela de compra.

### Validação feita
- Linter sem erros em `src/app/entrada-compra/page.tsx`.
- Verificação visual no localhost confirmou exibição do novo campo `Categoria` no modal de novo produto.

### Sessão - 2026-04-01 11:31:07 -0300 - Aba de estoque mínimo para reposição
- Implementada nova aba `Estoque mínimo` na tela `Estoque`, ao lado de `Visão operacional` e `Visão do dono`.
- Criada função SQL `public.resumo_estoque_minimo` para calcular reposição por produto/local:
  - usa produtos ativos com `estoque_minimo > 0`;
  - cruza com locais ativos para incluir casos com saldo zero;
  - calcula `quantidade_atual`, `estoque_minimo` e `faltante`;
  - permite filtro por local e busca por produto.
- Criado índice de apoio em `produtos` para acelerar leitura de mínimo/status.
- Service `src/lib/services/estoque-resumo.ts` passou a expor `getResumoEstoqueMinimo`.
- `src/app/estoque/page.tsx` atualizado para:
  - carregar dados da aba mínima via RPC;
  - exibir tabela com Produto, Local, Atual, Mínimo, Faltante e Status (Atenção/Crítico);
  - ocultar filtro de estado nessa aba (regra fixa de reposição em estoque atual).

### Validação feita
- Linter sem erros em `src/app/estoque/page.tsx` e `src/lib/services/estoque-resumo.ts`.
- Verificação visual em `localhost/estoque` confirmou botão da nova aba e renderização da tabela de reposição.

### Sessão - 2026-04-01 11:19:56 -0300 - Implementação da consulta agregada de estoque (performance)
- Implementada função SQL `public.resumo_estoque_agrupado` (via migration) para retornar estoque já agrupado por produto/local, com próxima validade.
- Criado índice de apoio em `itens` para acelerar filtro/agrupamento por estado/local/produto/validade.
- Criado service `src/lib/services/estoque-resumo.ts` para consumir a função via RPC.
- Refatorada `src/app/estoque/page.tsx` para usar o resumo agregado:
  - filtros de estado/local e busca aplicados direto no banco;
  - atualização em tempo real por eventos de `itens`, `produtos` e `locais`;
  - debounce de busca para reduzir chamadas excessivas.
- Impacto: elimina carregamento de dezenas de milhares de linhas no front ao abrir estoque, reduzindo tempo de resposta da tela.

### Validação feita
- Linter sem erros em `src/app/estoque/page.tsx` e `src/lib/services/estoque-resumo.ts`.
- SQL de teste da função retornando resultados corretos.
- Verificação visual no localhost confirmou listagem completa e rápida com contagens esperadas.

### Sessão - 2026-04-01 11:16:15 -0300 - Redução de latência ao abrir estoque
- Investigada lentidão de ~20s ao entrar na tela `Estoque` com base grande.
- Ajustado `useRealtimeQuery` para:
  - deduplicar chamadas concorrentes (`inFlightRef`), evitando fetch duplicado;
  - buscar páginas em paralelo com limite de concorrência (`maxParallel = 4`), em vez de sequencial.
- Mantida a consistência já implementada (paginação por `count exact` + ordenação estável).
- Impacto esperado: queda significativa do tempo de carregamento inicial em `itens` (menos round-trips em série).

### Validação feita
- Linter sem erros em `src/hooks/useRealtimeQuery.ts`.

### Sessão - 2026-04-01 11:13:33 -0300 - Verificação na tela logada e ajuste final de consistência
- Conferida a página `localhost/estoque` na sessão logada do Cursor.
- Validação cruzada com SQL mostrou divergência pontual após otimização inicial (contagens abaixo do banco em alguns produtos).
- Causa identificada: paginação dependia do tamanho da página retornada, mas a API limita respostas e podia encerrar cedo; além disso, paginação sem ordem estável pode gerar lacunas.
- Correções aplicadas:
  - `useRealtimeQuery`: paginação por `count exact` + `range` em lotes de até 1000;
  - `Estoque`: ordenação estável por `id` na query paginada.
- Revalidação no browser: contagens críticas passaram a bater com o banco (ex.: `Farinha Láctea 850 gramas = 13`, `Gotas de Chocolate 1,0 kg = 19`, `Leite em pó Merilu = 425`, `Amendoim = 176`).

### Validação feita
- Linter sem erros em `src/hooks/useRealtimeQuery.ts` e `src/app/estoque/page.tsx`.
- Verificação visual na aba logada do Cursor concluída após reload completo.

### Sessão - 2026-04-01 11:07:53 -0300 - Otimização de performance da tela de estoque
- Investigado atraso ao abrir `Estoque` no localhost.
- Causa: volume alto de `itens` sendo filtrado majoritariamente no front.
- Ajustes aplicados:
  - `useRealtimeQuery` passou a aceitar `filters` múltiplos (`eq`) para filtrar no banco;
  - `Estoque` passou a enviar filtros de `estado` e `local` direto na query realtime;
  - payload de `itens` foi reduzido para colunas essenciais (sem `created_at` no retorno);
  - tamanho de página aumentado na tela (`pageSize: 3000`) para reduzir round-trips.
- Impacto: abertura da tela e troca de filtros ficam mais rápidas, com menos processamento no browser.

### Validação feita
- Linter sem erros em `src/hooks/useRealtimeQuery.ts` e `src/app/estoque/page.tsx`.

### Sessão - 2026-04-01 11:05:08 -0300 - Estoque incompleto no localhost por limite de consulta
- Identificada a causa de "produtos faltando" na tela de estoque: `useRealtimeQuery` buscava apenas a primeira página de registros em tabelas grandes.
- `src/hooks/useRealtimeQuery.ts` foi ajustado para paginação automática (`range`) até carregar 100% dos registros.
- Adicionada opção `pageSize` (default 1000) para controle por tela quando necessário.
- Impacto: telas que usam realtime com alto volume (especialmente `itens`/estoque) deixam de truncar dados.

### Validação feita
- Linter sem erros no hook alterado.
- Com reload da tela de estoque no localhost, produtos deixam de sumir por limite de página.

### Sessão - 2026-04-01 10:53:21 -0300 - Correção de divergência no estoque agregado
- Identificada causa raiz de quantidade incorreta no estoque: fluxos que alteravam `itens` sem recalcular `estoque`.
- Criado service `src/lib/services/estoque-sync.ts` com recálculo por produto (`itens EM_ESTOQUE` -> `estoque` com `upsert onConflict produto_id`).
- Integrado recálculo automático em:
  - `criarLoteCompra` (entrada de compra);
  - `registrarProducaoComItens` (produção);
  - `baixarItem` e `descartarItem` (baixa diária/perda).
- Executada reconciliação SQL completa no banco para corrigir divergências históricas entre `itens` e `estoque`.
- Impacto: tela de estoque volta a refletir produtos e quantidades corretas e passa a se manter consistente nos fluxos operacionais principais.

### Validação feita
- SQL de conferência pós-reconciliação retornou `divergencias = 0` entre `estoque.quantidade` e contagem de `itens` em `EM_ESTOQUE`.

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
