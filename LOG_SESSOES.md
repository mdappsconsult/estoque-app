# Log de Sessões

### Sessão - 2026-04-20 - PWA: ícone e nome «Adicionar à Tela de Início» (iOS)
- **Pedido:** no atalho da tela inicial, mostrar o logotipo Açaí do Kim e o texto **controle de estoque** (em vez do «A» genérico e título longo).
- **Mudança:** [`src/app/layout.tsx`](src/app/layout.tsx) — `title` / `applicationName` / `appleWebApp.title` + `icons.apple` → `/branding/acai-do-kim-logo.png`; [`public/manifest.webmanifest`](public/manifest.webmanifest). `CONTEXTO_ATUAL.md`.
- **Impacto:** Safari passa a sugerir ícone e rótulo alinhados à marca; pode ser preciso **remover o atalho antigo** e adicionar de novo para limpar cache de ícone.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - SEP matriz→loja: reserva de estoque na criação da remessa
- **Pedido:** ao criar separação para loja, o saldo **Em estoque** na origem deve cair na hora (ex.: 10 → 9); só voltar ao cancelar a remessa SEP antes do trânsito.
- **Mudança:** [`src/lib/services/transferencias.ts`](src/lib/services/transferencias.ts) — em `criarTransferencia`, se `tipo === 'WAREHOUSE_STORE'`, `UPDATE itens` → `EM_TRANSFERENCIA` (origem inalterada) em fatias + `sincronizarEstoquePorProdutos` (client opcional no helper). `cancelarRemessaMatrizParaLoja`: valida `EM_ESTOQUE` ou `EM_TRANSFERENCIA` na origem; antes de apagar, restaura `EM_ESTOQUE` + sync. `despacharTransferencia`: pré-check idempotente (`EM_ESTOQUE` ou `EM_TRANSFERENCIA` na origem). `CONTEXTO_ATUAL.md`.
- **Impacto:** indústria/estoque matriz alinha painel ao físico na SEP; loja/recebimento inalterados (`IN_TRANSIT` + leitura de QRs como hoje).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Dados: fundir Loja Paraiso em Loja Jardim Paraíso
- **Pedido:** duas lojas cadastradas para a mesma unidade; manter o nome **Loja Jardim Paraíso** e concentrar dados.
- **Mudança:** transação SQL no Supabase — funde `loja_produtos_config` (GREATEST mínimo, OR ativo), realoca `loja_contagens`, funde `sequencia_balde_loja_destino` se existir, atualiza FKs (`usuarios`, `itens`, `transferencias`, `lotes_compra`, `baixas`, `perdas`, `producoes`, `auditoria`), remove o registro duplicado em `locais` (`32824153-4e04-4ac5-9216-06f747be7629`). Artefato: `docs/consultas-sql/fusao-lojas-paraiso-duplicada.sql`; `CONTEXTO_ATUAL.md`.
- **Impacto:** um único local STORE para essa filial; usuários com `local_padrao_id` da duplicata passam a Jardim Paraíso; histórico de remessas/auditoria com IDs atualizados.
- **Validação:** consultas pós-execução (local removido; Joana/Silvania em Jardim Paraíso).

### Sessão - 2026-04-20 - Trigger DB: bloquear mesmo QR em duas remessas abertas
- **Pedido:** garantia forte para nunca mais dupla reserva (corrida entre requisições), além do assert em `criarTransferencia`.
- **Mudança:** migração **`20260420180000_transferencia_itens_bloquear_dup_remessa_aberta.sql`** — função + `BEFORE INSERT` em `transferencia_itens` (`FOR UPDATE` em `itens`, `EXISTS` remessa aberta, `RAISE` `check_violation` com mensagem em PT). API **`POST /api/operacional/criar-separacao-matriz-loja`** usa `errMessage` no `catch` para repassar texto PostgREST. `CONTEXTO_ATUAL.md`.
- **Impacto:** novos vínculos inválidos falham no Postgres; histórico antigo não é alterado. Migração aplicada no projeto Supabase via **MCP**; repetir no deploy (`supabase db push` / pipeline) se outro ref.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Panorama dupla reserva (vários produtos / QRs)
- **Pedido:** entender a situação além de um único token; várias unidades com etiqueta vs sistema divergentes.
- **Leitura Supabase:** ~**364** itens com **2+** remessas em `transferencia_itens` (conjunto analisado: só **`WAREHOUSE_STORE`**); ~**328** com **mesmo dia** (`America/Sao_Paulo`), mesma origem e **dois destinos** (dupla lista). Picos: **16/04** Estoque **Delivery × Loja JK** (80 itens); **08–09/04** Estoque com vários pares; **16/04** Indústria Delivery×JK (15). Estados atuais desses itens: mistura **EM_ESTOQUE** / **EM_TRANSFERENCIA** / **BAIXADO**.
- **Artefatos:** `docs/consultas-sql/panorama-dupla-reserva-remessas.sql`; `CONTEXTO_ATUAL.md` (secção **Panorama dupla reserva**).
- **Validação:** consultas MCP/SQL; documentação apenas (blindagem em `criarTransferencia` já registrada na sessão anterior).

### Sessão - 2026-04-20 - Etiqueta «Delivery» vs loja JK: dupla remessa + blindagem
- **Problema:** mesmo QR em duas remessas no mesmo dia (JK e Delivery); etiqueta 60×30 mostra **nome do destino da separação** impressa; último `RECEBER_TRANSFERENCIA` definiu `local_atual` na **Loja JK** — operador via divergência entre rótulo e sistema.
- **Causa:** índice único só `(transferencia_id, item_id)`; antes do despacho o item segue `EM_ESTOQUE` na origem, então **segunda separação** aceitava o mesmo QR outra vez.
- **Mudança:** `assertItensSemVinculoRemessaAberta` em `criarTransferencia` (`transferencias.ts`); SQL de diagnóstico `docs/consultas-sql/item-token-qr-multiplas-remessas.sql`; `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Etiquetas SEP: sem fallback se a transferência não carregar
- **Pedido:** plano A (lista pela transferência) sempre; não usar só `etiquetas` quando a leitura da remessa falha.
- **Mudança:** `/etiquetas` — removido fallback; erro explícito se `listarItemIdsRemessaSepOrdenados` for `null`/vazio ou se faltar montar alguma unidade; lista vazia até resolver. `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Etiquetas SEP: lista só pela separação (sem união extra)
- **Pedido:** simplificar — quantidade da remessa = o que foi lançado em Separar por Loja; operação só com produto etiquetado / QRs da remessa.
- **Mudança:** `/etiquetas` para `SEP-…` usa apenas `listarItemIdsRemessaSepOrdenados` quando há dados; remove união com ids só em `etiquetas` e o bloco de três contagens. `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Etiquetas SEP: união transferência + etiquetas + totais na UI
- **Pedido:** conferir se a remessa reflete tudo o que foi separado; não esconder unidades.
- **Mudança:** `listarItemIdsRemessaSepOrdenados` com `transferencia_itens` em fatias; ordem da folha = transferência + ids só em `etiquetas`; bloco «Conferência» com 3 números. `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Etiquetas SEP: imprimir/prévia com todas as unidades da transferência
- **Problema:** só apareciam as linhas já gravadas em `etiquetas` (ex.: 2), faltando o restante da remessa SEP na folha.
- **Mudança:** `listarItemIdsRemessaSepOrdenados` em `etiquetas.ts`; `/etiquetas` mescla ordem da transferência `WAREHOUSE_STORE` + linhas fantasma a partir de `itens` quando falta registro em `etiquetas`; `contarUnidadesTransferenciaPorLoteSep` reutiliza a lista. `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Etiquetas: prévia sem upsert + lista só total
- **Problema:** «Ver prévia» falhava para operador (ex. matriz Estoque) e a lista longa por produto/tokens não era necessária.
- **Mudança:** `previsualizarEtiquetas` não chama mais `garantirNumerosSequenciaBaldeAntesImpressao`; `rowsParaEtiquetasImpressao(..., null)` usa só o que já veio da query. Removidos grupos/lista detalhada; faixa com total de etiquetas + aviso prévia vs impressão. `CONTEXTO_ATUAL.md` (Etiquetas + prévia).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Etiquetas: fluxo mínimo (sem filtros, sem painel verde, sem marcar impressão na UI)
- **Pedido:** `/etiquetas` só **SEP → escolher remessa → prévia/impressão da remessa inteira** no topo; remover filtros Pendentes/Impressas/Todas, card verde (sync, contagens, produtos, código duplicado), ações por grupo/linha e `marcarImpressa` nesta página; lista só consulta.
- **Mudança:** `src/app/etiquetas/page.tsx` (UI e estado); `src/lib/services/etiquetas.ts` — `impressaPorId` ignora `excluida`; preservação de `impressa` no upsert só quando baseline é **mesmo lote** ativo (SEP e não-SEP). `CONTEXTO_ATUAL.md` / `LOG_SESSOES.md`.
- **Impacto:** não há mais sync de transferência → `etiquetas` nesta tela; alinhamento raro fica em **Separar por Loja**, suporte ou **`POST /api/operacional/sync-etiquetas-remessa`**.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Marca: logotipo Açaí do Kim no app
- **Pedido:** usar o logotipo fornecido nos pontos adequados da interface.
- **Mudança:** `public/branding/acai-do-kim-logo.png`; componente **`LogoKim`** (`src/components/branding/LogoKim.tsx`); **`/login`**, **`MobileHeader`**, **`/`** (home), **`AuthGuard`** (loading), **`Sidebar`**, **`Header`**; **`layout.tsx`** — título/descrição com marca.
- **Impacto:** identidade visual alinhada à operação; título da aba do navegador reflete a marca.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-20 - Produção: lote sequencial + rastreio na etiqueta 60×60 (sem SEP na face)
- **Pedido:** declarar lote de produção por lançamento (nº sequencial por produto+armazém), posição **k/N** e data de criação na etiqueta **60×60** ao imprimir após separação; não exibir `LOTE: SEP-…` na face impressa.
- **Mudança:** migração **`20260420120000_producao_lote_rastreio_etiqueta.sql`** (`sequencia_lote_producao`, RPC `reservar_numero_lote_producao`, colunas em `producoes`/`itens`/`etiquetas`); **`registrarProducaoComItens`**; **`upsertEtiquetasSeparacaoLoja`** (baseline por `id` + preservação); **`label-print`** (`EtiquetaParaImpressao`, faixa `e6060-lote-prod`); **`/etiquetas`** e **`/producao`**; tipos **`database.ts`**; **`createProducao`** reserva lote se omitido.
- **Impacto:** deploy exige migração no Supabase; etiquetas antigas sem metadados não mostram linha de lote prod. (só tokens + demais campos).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-15 - Validades: contexto de auditoria na lista
- **Pedido:** na tela de validade, deixar explícito «hoje», quando o produto «chegou» no local e demais dados para auditoria.
- **Mudança:** `validades-itens.ts` — select ampliado + enriquecimento (etiquetas lote SEP, `lotes_compra`, menor data entre recebimento na loja e entrada de faltante em divergência; fallback data de criação da remessa); `formatar-auditoria-br.ts` (datas em pt-BR, fuso São Paulo). **`/validades`:** bloco «Referência desta lista», cartões com ID, token curto, datas e lotes.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-15 - Divergências: gestor dá entrada do faltante na loja
- **Pedido:** botão para o gestor colocar no estoque da loja de destino o produto que não foi lido no recebimento (faltante físico encontrado depois).
- **Mudança:** `darEntradaFaltanteNaLojaDivergencia` em `divergencias.ts` (service role); `recalcularEstoqueProduto` aceita `SupabaseClient` opcional; rota **`POST /api/operacional/dar-entrada-faltante-divergencia`** (`MANAGER` / `ADMIN_MASTER` + credencial); UI **Dar entrada na loja** + modal de login/senha; **Resolver** permanece só marcação. Auditoria `ENTRADA_FALTANTE_DIVERGENCIA_LOJA`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-16 - Produção: validade por dias em calendário BR + etiqueta sem “um dia a menos”
- **Problema:** validade do acabado parecia “presa” ao primeiro cálculo ou dia errado: `toISOString().slice(0,10)` após `setDate` usa **dia UTC**, não o calendário de Brasília; na etiqueta, `new Date('YYYY-MM-DD')` vira meia-noite **UTC** e em pt-BR aparecia **um dia antes**.
- **Mudança:** `src/lib/datas/validade-producao-br.ts` — `calcularDataValidadeYmdAposDiasCorridosBr` (hoje em `America/Sao_Paulo` + N dias) e `formatarValidadeDdMmAaEtiquetaBr` (prioriza prefixo `YYYY-MM-DD`). **`registrarProducaoComItens`** e prévia em **`/producao`** usam o mesmo cálculo; **`formatarValidadeEtiquetaIndustria`** (60×60) usa o formatador seguro.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-16 - Etiquetas: Leonardo vê todas as remessas SEP da indústria
- **Pedido:** funcionário Leonardo deve visualizar **todos** os lançamentos da indústria (remessas `SEP-…`).
- **Mudança:** em **`/etiquetas`**, removido o filtro `apenasCriadorUsuarioId` em `buscarOpcoesRemessaSepParaEtiquetas` para logins indústria (60×60 / `usuarioIndustriaSemConsultaEstoque`). Lista de lotes alinhada às demais telas da matriz (origem = `local_padrao_id`), sem restringir a `transferencias.criado_por`.
- **Impacto:** Leonardo (e demais logins em `NEXT_PUBLIC_ETIQUETAS_INDUSTRIA_LOGINS`) passam a ver separações registradas por **qualquer** usuário da indústria.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-16 - Validade SEP Indústria (Delivery / Balde 11L) 15/04 → 22/04
- **Problema:** etiquetas **Indústria** com lote **`SEP-…`** (ex.: envio **Delivery**, Açaí Balde 11L) continuavam **Val. 15/04/26** na impressão; o SQL antigo filtrava só `created_at = 16/04`, mas no banco o `created_at` dessas linhas **não** era 16 (ex.: 10/04 no ref do MCP).
- **Mudança:** `UPDATE` em **`etiquetas`** e **`itens`**: local **«Indústria»**, `lote LIKE 'SEP-%'`, validade ainda **15/04/2026** → **22/04/2026** (MCP: **33** linhas). Ordem: `itens` antes de `etiquetas` (mesmo critério `EXISTS`).
- **Doc:** `docs/consultas-sql/correcao-validade-etiquetas-industria-2026-04-16.sql` — bloco **(A) SEP**.
- **Produção:** se o app ainda mostrar 15/04, rodar o mesmo SQL no Supabase do **Railway** (ref pode diferir do dev).

### Sessão - 2026-04-16 - Reverter validade no local Estoque (não devia mudar)
- **Pedido:** «Estoque» não era para alterar; deixar como era (**15/04/2026**).
- **Mudança:** no Postgres do MCP, **550** etiquetas + **550** itens no local **«Estoque»** (geradas **16/04/2026**) revertidos de **22/04** para **15/04/2026**. Script para outros ambientes: **`docs/consultas-sql/reverter-validade-estoque-2026-04-16.sql`**. **`correcao-validade-etiquetas-industria-2026-04-16.sql`** fica só para **Indústria** (variante Estoque removida).
- **Validação:** contagens pós-update; `itens` corrigidos em segundo `UPDATE` (ordem após `etiquetas`).

### Sessão - 2026-04-16 - Correção de validade (etiquetas indústria 16/04 → 22/04/2026)
- **Pedido:** alterar validade das etiquetas geradas em **16/04/2026**, somente **indústria** (local `WAREHOUSE`), para **22/04/2026**.
- **Mudança (1ª rodada):** SQL no MCP: `WAREHOUSE` + criadas em **16/04** → **550** etiquetas (no ref do MCP todas eram local **«Estoque»**, não «Indústria»), validade **22/04**.
- **Ajuste (2ª rodada):** o operador ainda via **15/04/2026** onde o banco de **produção** grava no local **«Indústria»** (ou o MCP ≠ Railway). Script **`docs/consultas-sql/correcao-validade-etiquetas-industria-2026-04-16.sql`** refeito: filtro **`locais.nome = 'Indústria'`** + **`data_validade` ainda no dia 15/04/2026** + criadas em 16/04; variante comentada para **«Estoque»** se aplicável. Rodar no **Supabase de produção** o bloco certo.
- **Impacto:** impressão / QR alinhados a **22/04/2026** para o conjunto filtrado.
- **Validação:** diagnóstico por `nome` do local; MCP sem linhas em Indústria no dia 16 (0); produção depende do ref Railway.

### Sessão - 2026-04-15 - `registrado_por`: código alinhado ao banco (sem fallback)
- **Pedido:** alinhar perfeitamente — sem retry sem a coluna.
- **Mudança:** removidos `postgrestColunaAusenteNoSchemaCache` e o segundo insert em **`producoes`** (`producao.ts`) e **`lotes_compra`** (`lotes-compra.ts`); removido `src/lib/supabase/postgrest-coluna-schema-cache.ts`. Inserts **sempre** enviam `registrado_por`; exige migração **`20260410140000_lotes_producoes_registrado_por.sql`** no Supabase do ambiente.
- **Impacto:** deploy sem essa migração continua falhando com mensagem PostgREST (comportamento explícito até o banco alinhar).
- **Validação:** `npm run lint`, `npm run build`. **Supabase (ref do `.env.local`):** mesma SQL aplicada via MCP (`apply_migration` `lotes_producoes_registrado_por`, idempotente). **Produção Railway:** confirmar o mesmo ref e rodar a migração se ainda faltar.

### Sessão - 2026-04-10 - SEP: numeração de balde contínua por loja (entre remessas)
- **Pedido:** após remessa Delivery terminar no balde 28, a próxima remessa para a mesma loja deve seguir 29, 30…; cada loja com contador próprio.
- **Mudança:** `upsertEtiquetasSeparacaoLoja` (lote `SEP-…`) passa a usar `reservar_sequencia_balde_loja` por **loja de destino** (mapa item→destino via `transferencias`/`transferencia_itens` da viagem; fallback `local_destino_id` no fluxo atômico antes da transferência existir). Preserva `numero_sequencia_loja` já gravado; novos baldes em ordem estável por `item_id`. Nova RPC **`ajustar_sequencia_balde_loja_ao_max_etiquetas`** (`20260410203000_…`) alinha o contador ao máximo já presente em `etiquetas` (evita recomeçar em 1 se o contador estava defasado). **`/etiquetas`:** removida renumerção 1..N pela ordem de impressão; PDF/prévia/Pi usam o número do banco/upsert.
- **Validação:** `npm run lint`, `npm run build`. **Deploy DB:** migração aplicada no Supabase via **MCP** (`apply_migration` / `ajustar_sequencia_balde_loja_ao_max_etiquetas`).

### Sessão - 2026-04-10 - Etiquetas indústria: só remessas criadas pelo próprio login
- **Problema:** operador da indústria via no select remessas/impressões ligadas a outros usuários ou contextos.
- **Mudança:** `buscarOpcoesRemessaSepParaEtiquetas` — opção `apenasCriadorUsuarioId`; select de `transferencias` inclui `criado_por`; `criadoresTransferencia` por viagem; `enriquecerCriadoresTransferencia` quando falta meta; filtro após origem. Página **Etiquetas** passa `usuario.id` para logins indústria (`usuarioIndustriaSemConsultaEstoque`). Texto de lista vazia ajustado.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Produção: `registrado_por` ausente no Supabase + prévia no modal
- **Problema:** PostgREST «Could not find the 'registrado_por' column of 'producoes' in the schema cache» quando a migração `20260410140000_lotes_producoes_registrado_por.sql` não foi aplicada no projeto.
- **Mudança:** `postgrestColunaAusenteNoSchemaCache` + retry do insert em **`producoes`** e **`lotes_compra`** sem `registrado_por` (console.warn pedindo migração). Modal **Confirmar registro de produção:** botão **Ver modelo 60×60** (até 3 amostras com dados do formulário; tokens/lote fictícios até confirmar).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Prévia de etiquetas antes de imprimir
- **Pedido:** conferir layout/dados antes de enviar à impressora ou à Zebra.
- **Mudança:** `abrirPreviaEtiquetasEmJanela` em `label-print` (nova aba, mesmo HTML do job, faixa «Prévia» + texto auxiliar; `mensagemBarra` escapada). **Etiquetas:** «Ver prévia» (pendentes no topo), «Ver prévia — remessa», «Prévia» por grupo, ícone olho por linha. **Produção:** «Ver prévia» antes dos botões de impressão 60×60.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Etiqueta 60×60 indústria (Zebra): QR central e raster mais nítido
- **Problema:** QR na borda da área média parecia borrado na Zebra.
- **Mudança:** `label-print` — faixa `.e6060-mid` em **grid** (`1fr` / coluna do QR / `1fr`), QR na coluna central, meta validade/gerou à direita; `<img>` 60×60 com pixels iguais a `pixelsQrParaImpressao`; classe `.qr-6060` com `image-rendering: pixelated`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Recebimento: não fechar remessa com conferência parcial
- **Problema:** operador podia tocar em «Confirmar» com apenas 1 item e a remessa ia para `DIVERGENCE` (encerrava sem conferência completa).
- **Mudança:** `recebimento` — botão principal só com **todos** os itens escaneados; botão **Encerrar com divergência…** com `confirm` explícito (inclui caso zero escaneados). `receberTransferencia` passa a exigir `encerrarComDivergencia: true` quando houver divergência calculada.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Reabrir remessa Jardim Paraíso 09/04 (divergência indevida)
- **Contexto:** Silvania precisava receber produtos do dia 9; remessa estava `DIVERGENCE` (confirmado sem escaneio completo / fluxo motorista antigo).
- **Mudança:** migração **`20260410200000_reabrir_remessa_divergencia_jardim_paraiso_2026_04_09.sql`** — apaga `divergencias`, `recebido=false` em `transferencia_itens`, itens da remessa → `EM_TRANSFERENCIA` na **origem**, `transferencias` → `IN_TRANSIT`. Executada no Supabase do MCP; **produção:** aplicar se o mesmo caso existir.
- **Validação:** SQL no MCP; 74 itens na origem; status `IN_TRANSIT`.

### Sessão - 2026-04-10 - Recebimento: painel «já encerradas» (divergência / recebida)
- **Contexto:** Silvania (Jardim Paraíso) no localhost não via «dia 9» — no banco a remessa do 09/04 para essa loja está **`DIVERGENCE`**, fora do select que só mostra **`IN_TRANSIT`**.
- **Mudança:** bloco informativo listando remessas **`DELIVERED`** / **`DIVERGENCE`** dos últimos **14 dias** para o `destino_id` da operadora, explicando por que não entram no menu.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Recebimento: filtro `destino_id` no Supabase (loja)
- **Problema:** Paraíso / Santa Cruz não viam remessas do dia 9 na lista (possível truncagem ao paginar `transferencias` inteira ou carga antes de `local_padrao_id` hidratar).
- **Mudança:** `/recebimento` — `OPERATOR_STORE` usa `useRealtimeQuery` com `filters` `destino_id = local_padrao_id` e `enabled` só com usuário + loja definidos; gerente/dono segue sem filtro de destino.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Backfill: remessas ACCEPTED → IN_TRANSIT (Léo / lojas)
- **Pedido:** corrigir entregas de ontem presas após só «aceitar» viagem, para as lojas verem no Recebimento.
- **Mudança:** migração **`20260410180000_backfill_remessas_aceitas_para_em_transito.sql`** — `WAREHOUSE_STORE` + `ACCEPTED` com viagem `ACCEPTED` ou `IN_TRANSIT`: itens `EM_ESTOQUE` → `EM_TRANSFERENCIA`, remessa → `IN_TRANSIT`, viagem `ACCEPTED` → `IN_TRANSIT` se não sobrar remessa `AWAITING_ACCEPT`/`ACCEPTED`. Executada no Supabase ligado ao MCP (projeto local); **produção:** aplicar o mesmo SQL se necessário.
- **Validação:** SQL no MCP; contagens pós-execução.

### Sessão - 2026-04-10 - Viagem: aceitar já coloca em trânsito (loja vê no Recebimento)
- **Problema:** só existia um botão «aceitar»; Léo aceitava e remessas ficavam `ACCEPTED` — loja não via no Recebimento até **Iniciar viagem**.
- **Mudança:** `aceitarViagem` passa viagem para `IN_TRANSIT` e despacha remessas `AWAITING_ACCEPT` ou `ACCEPTED` (loja já tinha aceitado) com itens `EM_TRANSFERENCIA`; helper compartilhado com `iniciarViagem`. UI: botão **Aceitar viagem**, modal sem segunda chamada a `iniciarViagem`; textos de ajuda ajustados.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Recebimento + Viagem / Aceite: fila ACCEPTED e orientação ao motorista
- **Contexto:** loja não via envio após Léo «aceitar»; em Aceite não havia mais botão — remessa fica `ACCEPTED` até **Iniciar viagem** (`IN_TRANSIT`).
- **Mudança:** `filtrarRemessasMatrizAguardandoMotorista` + faixa em **Recebimento** listando essas remessas; **Viagem / Aceite** — caixa de ajuda quando não há pendentes (perfil motorista); no **Histórico**, avisos para viagem sem remessa ou remessa com status ≠ trânsito.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Viagem / Aceite: histórico recolhido
- **Mudança:** `/viagem-aceite` — seção **Histórico** inicia fechada; cabeçalho clicável com chevron expande/recolhe (até 10 itens inalterados).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Remoção de viagens órfãs (UI + MCP + migration pontual)
- **Pedido:** apagar as viagens «4FC3B3A7», «9BD26EB9», «F623CF69» sem remessa vinculada.
- **MCP (projeto ligado ao `.env.local`):** bloco `DO` com os três prefixos (nenhuma linha afetada — já ausentes); removidas **2** outras órfãs (`be635a57…`, `bbd6f8d4…`) com `UPDATE etiquetas` + `DELETE viagens`; conferência: **0** viagens sem remessa restantes.
- **Repo:** migração **`20260410161000_remover_viagens_orfas_prefixos_ui.sql`** para reaplicar nos três prefixos em outro ambiente/produção se ainda existirem.
- **Validação:** SQL no MCP; `npm run lint` / `npm run build` não obrigatórios para só SQL (sem mudança TS neste passo).

### Sessão - 2026-04-10 - Viagens órfãs: trigger no banco + limpeza + Viagem / Aceite
- **Problema:** viagens sem `transferencias` vinculadas (remessa apagada sem apagar viagem; ou falha de compensação).
- **Mudança:** migração **`20260410153000_viagem_orfa_trigger_e_limpeza.sql`** — função `SECURITY DEFINER` + trigger após `DELETE` em `transferencias`: se não sobrar remessa na viagem, `UPDATE etiquetas` (`SEP-{uuid}`) `excluida` e `DELETE` em `viagens`; no mesmo arquivo, **limpeza única** de viagens já órfãs + etiquetas. **`/viagem-aceite`:** `Promise.allSettled` + log em falha parcial (não apaga o mapa inteiro).
- **Impacto:** consistência automática no futuro; dados legados corrigidos ao aplicar a migration.
- **Validação:** `npm run lint`, `npm run build`. **Produção:** aplicar a migration no Supabase.

### Sessão - 2026-04-10 - Impressoras: mensagem para HTTP 530 / Cloudflare 1033 (ponte Pi)
- **Contexto:** «Verificar agora» na ponte estoque mostrava só «Resposta inesperada (HTTP 530)»; `GET https://print…/health` retorna corpo típico `error code: 1033` quando o túnel não tem **cloudflared** conectado.
- **Mudança:** `/api/impressoras/status` — texto orientando Pi/systemd/Zero Trust; bullet em `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Etiquetas: seletor Estoque × Indústria (Leonardo fixo)
- **Pedido:** equipe alternar matriz na lista de remessas; Leonardo só indústria, sem ver estoque central.
- **Mudança:** `etiquetas-origem-matriz.ts` (resolve UUIDs por nome); `/etiquetas` com `<select>` + `sessionStorage` para quem não é login indústria; Leonardo mantém texto fixo + `local_padrao_id`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Separar por Loja: Leonardo sem escolher «Estoque» central
- **Pedido:** na separação matriz → loja, login indústria não deve operar como origem o armazém central «Estoque».
- **Mudança:** `usuarioIndustriaSemConsultaEstoque` — opções de **Origem** limitadas ao `local_padrao_id` (warehouse); select travado quando há um único local; avisos se faltar local padrão ou tipo errado.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Etiquetas: Leonardo só remessas da indústria
- **Problema:** no select de remessa, login indústria via RPC/`etiquetas` ainda via «Estoque → loja».
- **Correção:** `OpcaoRemessaSepEtiquetas.origemLocalId` + filtro final por `origemId` após enrich; `/etiquetas` passa `local_padrao_id` também para `usuarioIndustriaSemConsultaEstoque` (não só `OPERATOR_WAREHOUSE*`). Mensagens quando lista vazia / sem local padrão.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Leonardo (login indústria): sem tela Estoque
- **Pedido:** Leonardo é motorista e responsável pela indústria — não precisa da consulta **Estoque**; acesso alinhado ao que usa no dia a dia.
- **Mudança:** `usuarioIndustriaSemConsultaEstoque` (mesmo critério de login que Etiquetas Zebra). Bloqueio de `/estoque` em `usuarioPodeAcessarRota` + `AuthGuard` (mensagem específica); card removido na **home**; item oculto na **Sidebar**. Demais rotas do perfil (viagem, compra, produção, separar, etiquetas, validades, etc.) inalteradas.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Leonardo: voltar a ver todos os lançamentos da indústria
- **Pedido:** funcionário Leonardo deve visualizar **todos** os lançamentos da indústria, não só os dele.
- **Mudança:** removidos filtros por `registrado_por` / `criado_por` e faixas de aviso em **Registrar Compra**, **Separar por Loja** e **Etiquetas**; removidos `criadoPorUsuarioId`, `somenteCriadoPorUsuarioId` e `usuarioIndustriaVeSomentePropriosLancamentos`. Colunas `registrado_por` no banco e nos inserts **permanecem** (auditoria).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Indústria restrita (Leonardo): só próprios lançamentos
- **Pedido:** funcionário Leonardo / login indústria vê **apenas** lançamentos da indústria feitos por ele.
- **Mudança:** colunas `registrado_por` em `lotes_compra` e `producoes` (insert preenchido; backfill `ENTRADA_COMPRA` / `PRODUCAO` na `auditoria`). `usuarioIndustriaVeSomentePropriosLancamentos` (mesmo critério do login Zebra Etiquetas). Filtros: **Registrar Compra** (`useRealtimeQuery`), **Separar por Loja** (`buscarEnviosRecentesMatrizParaLojas` + `criado_por`), **Etiquetas** (`buscarOpcoesRemessaSepParaEtiquetas`). Faixas de aviso nas telas.
- **Validação:** `npm run lint`, `npm run build`. Aplicar migração no Supabase de produção.

### Sessão - 2026-04-10 - Etiquetas: indústria só Zebra 60×60 (sem navegador)
- **Pedido:** Leonardo / login indústria com **apenas** impressão Zebra 60×60 em `/etiquetas` (sem opção navegador nem outros formatos).
- **Mudança:** formato **60×60** fixo + botões só Pi; removidos impressão navegador, ícone por linha e `localStorage` de formato restaurado (evita 60×60 residual no estoque no mesmo aparelho).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Etiquetas: Zebra 60×60 só indústria (login); estoque só navegador 60×30
- **Pedido:** Leonardo (indústria) imprime **Zebra 60×60** em `/etiquetas`; equipe estoque só **navegador 60×30**.
- **Mudança:** `usuarioEtiquetasPodeImprimirZebra6060` + `NEXT_PUBLIC_ETIQUETAS_INDUSTRIA_LOGINS` (CSV); sem env, fallback login **`leonardo`**. Demais logins: seletor travado 60×30, sem botões Pi. Indústria: seletor completo; Pi **60×60** inclusive remessa **SEP-…**. `usePiPrintBridgeConfig` com `enabled` quando formato 60×60 + login permitido.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Etiquetas 60×30: pouca quantidade ao final da ordem
- **Mudança:** `ordenarEtiquetasPorProdutoParaImpressao` ordena por **contagem na lista a imprimir** (desc), depois nome e `id` — evita um SKU com 1 etiqueta no meio de um bloco enorme de outro. Grupos na UI por total (desc) e nome. `confirmarImpressao` e `CONTEXTO_ATUAL.md` alinhados.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Etiquetas 60×30: colunas por produto após corte na tesoura
- **Pedido:** após cortar no pontilhado, uma pilha com as meias de **um lado** deve seguir a sequência por produto (amendoim, flanela, 473…) até «terminar a primeira lista»; a outra pilha = restantes.
- **Mudança:** mantém `ordenarEtiquetasPorProdutoParaImpressao` + reativa `preparar60x30PilhasPorLado` na impressão **60×30** só em `/etiquetas` via terceiro argumento de `imprimirEtiquetasEmJobUnico`; `confirmarImpressao` e `CONTEXTO_ATUAL.md` alinhados.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Etiquetas 60×30: sequência por produto após corte
- **Objetivo:** após cortar no pontilhado, percorrer meias na ordem natural (folha a folha, esq→dir) com o **mesmo produto em sequência** (ex.: flanelas, depois copos).
- **Mudança:** `gerarDocumentoHtmlEtiquetas` só aplica `prepararEtiquetas60x30ParaPilhasEsquerdaDireita` se `preparar60x30PilhasPorLado === true` (default off). `enviarEtiquetasParaPiEmMultiplosJobs` com `preparar60x30PilhasPorLado` opcional; corrigido delay com `lista.length`. `/etiquetas`: `ordenarEtiquetasPorProdutoParaImpressao` antes do upsert/impressão em `imprimirLista` e `imprimirRemessaInteiraNavegador`; grupos na UI ordenados por produto e linhas por balde/`id`. `confirmarImpressao` 60×30 alinhado. `CONTEXTO_ATUAL.md`.
- **Impacto:** desliga por padrão o pareamento «1ª metade | 2ª metade»; quem precisar pode passar `preparar60x30PilhasPorLado` no código/Pi.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-10 - Etiquetas 60×30: ordem para pilhas esquerda/direita
- **Problema:** duas meias por folha com pareamento consecutivo (1|2, 3|4) fazia quem junta **todas as esquerdas** e **todas as direitas** perder a sequência (1,3,5 / 2,4,6).
- **Mudança:** `prepararEtiquetas60x30ParaPilhasEsquerdaDireita` em `label-print.ts`; `gerarDocumentoHtmlEtiquetas` aplica no 60×30 (opção `preparacao60x30JaAplicada` para evitar dupla preparação); `enviarEtiquetasParaPiEmMultiplosJobs` prepara o lote inteiro antes de fatiar quando `formato === '60x30'`. `confirmarImpressao` 60×30 com linha explicando a ordem. Indústria 60×60 inalterada.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Etiquetas: copy enxuta na UI
- **Mudança:** removidos faixas e parágrafos longos (SEP vs indústria, carregamento por remessa, lista de opções); rótulos `FORMATO_CONFIG` curtos (`60×30 mm`, `60×60 mm`); botão **Imprimir pendentes** sem sufixo; estado vazio e painel remessa simplificados; `alert` Pi mais curtos; import não usado `ETIQUETAS_UI_LIMITES_REMESA`.
- **Impacto:** mesma lógica de impressão; menos ruído visual.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Etiquetas: SEP = 60×30 navegador; Zebra 60×60 só indústria
- **Regra:** com remessa **SEP-…** o formato fica **60×30**, impressão **só navegador** (seletor travado); **Zebra/Pi** e **60×60** só sem lote SEP (uso indústria). `useLayoutEffect` força 60×30 ao escolher SEP; `imprimirListaNoPi` bloqueia lote `SEP-`.
- **UI:** faixa informativa, rótulos **Zebra 60×60 (indústria)**; `FORMATO_CONFIG` em `label-print` com texto estoque/indústria.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Separar por Loja: impressão só em Etiquetas
- **Mudança:** removidos painel «última remessa», **Guia PDF + imprimir** e **Só imprimir etiquetas**; lista vazia sem texto extra; após **Criar separação** só `persistirUltimaRemessa` + aviso com link **Etiquetas**.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Separar por Loja: UX mais enxuta
- **Mudança:** removidos/encurtados blocos de texto explicativo (última remessa, guia PDF, modais, envios, reposição/manual, rodapé da tabela); painel pós-separação virou uma linha + botões **Imprimir** / **Esquecer**.
- **Validação:** `npm run lint`.

### Sessão - 2026-04-09 - Impressão: estoque só navegador; Zebra só indústria (60×60)
- **Objetivo:** em fluxo matriz→loja (**Separar por Loja** / remessas **60×30**), não oferecer envio para Pi/Zebra; térmica fica na **indústria** (ex.: **Produção** e **Etiquetas** em **60×60**).
- **Separar por Loja:** removidos hook Pi, botões e fallback pós-**Criar separação**; painel **Imprimir pedido completo** e textos falam só em **navegador** (60×30).
- **Etiquetas:** `usePiPrintBridgeConfig` só **indústria**; botões **Zebra/Pi** e envio WebSocket aparecem **apenas** com formato **60×60**; **60×30** e outros = só navegador; removido fallback «ponte estoque» para 60×60.
- **Docs:** `CONTEXTO_ATUAL.md` alinhado (Pi multi-job, bullets Etiquetas / label-print).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Dados: correção divergência Estoque → Delivery (481 faltantes)
- **Contexto:** remessa com destino **Delivery** ficou `DIVERGENCE` após recebimento parcial; **Loja JK** sem transferência `DIVERGENCE` no mesmo projeto.
- **Ação (Supabase, MCP `execute_sql`):** transação — `transferencia_itens.recebido` para os 481 faltantes; `itens` → `local_atual_id` Delivery, `EM_ESTOQUE` (estavam `EM_TRANSFERENCIA` no Estoque); `divergencias` marcadas resolvidas (`resolvido_por` Marco); `transferencias.status` → `DELIVERED`; `estoque` upsert por `produto_id` afetado; auditoria `CORRECAO_DIVERGENCIA_ENTREGUE`.
- **Transferência:** `ccff554b-82e3-4200-956f-85af6cd7b346` — 485/485 recebidos após correção.
- **Registro:** `docs/consultas-sql/correcao-divergencia-estoque-delivery-2026-04-09.sql` (não reexecutar sem revisar IDs).
- **Validação:** consultas pós-SQL (status, contagens, 0 itens da remessa fora do Delivery/`EM_ESTOQUE`).

### Sessão - 2026-04-09 - Recebimento: aviso com dois telefones na mesma conta
- **Problema:** operação usou dois celulares logados na mesma conta para escanear mais rápido; um confirmou (ou gerou divergência) e o outro mostrou «não está mais em trânsito» com contagem de escaneados diferente — lista local por aparelho, sem sincronização.
- **Mudança:** `/recebimento` — texto de ajuda sob os totais; `useEffect` com dados em realtime: se a remessa selecionada sair de `IN_TRANSIT`, limpa seleção e exibe faixa âmbar explicando (incl. outro aparelho / `DELIVERED` / `DIVERGENCE`); mensagens de erro no confirm alinhadas.
- **Impacto:** menos confusão operacional; fluxo correto continua sendo **um dispositivo** até confirmar (sincronização entre aparelhos exigiria evolução de produto/API).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Divergências: filtros e agrupamento por remessa
- **Objetivo:** administrador localizar rápido o que não foi conferido (faltante) ou QR fora da remessa (excedente), por loja/remessa.
- **Código:** `listarDivergenciasAdmin` em `divergencias.ts` (filtros no servidor: situação, destino, tipo, UUID remessa; fatias `.in` por loja; busca client-side); página `/divergencias` com selects, busca com debounce, checkbox agrupar por remessa, cartões expansíveis (origem→destino, id transferência, viagem curta, contadores); realtime `postgres_changes` com ref via ref; resolver sem `alert`.
- **Ajuste:** `listarRemessasParaFiltroDivergencias` + `<select>` de remessa (rótulo origem→destino, data, id curto, status, viagem); UUID completo exibido abaixo ao escolher; opções recarregam com loja/Realtime/Atualizar.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Separar por Loja: gravação atômica no servidor + performance
- **Problema:** três chamadas no browser (viagem → etiquetas → transferência) sem transação deixavam **viagem + etiquetas sem `transferencias`** se o último passo falhasse; listas grandes deixavam a tela e «Envios já registrados» lentos.
- **Mudança:** `POST /api/operacional/criar-separacao-matriz-loja` valida login operacional + perfis; `criarSeparacaoMatrizLojaAtomica` (service role) com **`compensarSeparacaoMatrizLojaIncompleta`** em falha; `criarTransferencia` e `registrarAuditoria` aceitam `SupabaseClient` opcional; chunk insert **200**. `buscarEnviosRecentesMatrizParaLojas` refeita com queries leves + chunks (**40** remessas no UI). Página: modal de senha após confirm, lista de itens com **Mostrar mais**.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Etiquetas: meta no serviço + aviso 37 vs 134 unidades
- **Problema:** «Separar por Loja» mostrava 134 unidades e lote SEP-…, mas em `/etiquetas` o painel dizia «origem/destino não carregaram» e só **37** linhas — meta vinha de um efeito separado na página (falhava para remessas fora do top 200 de transferências ou só vindas da RPC); a lista reflete só linhas em `etiquetas`, não o total da transferência.
- **Mudança:** `buscarOpcoesRemessaSepParaEtiquetas` passa a trazer **`origemNome` / `destinoNome` / `status` / `destinoLocalId`** com `transferencias` + embed `locais`; `enriquecerOpcoesSemMeta` busca por `viagem_id` para opções vindas só de RPC/etiquetas. Página monta `metaPorViagemId` com `useMemo` a partir das opções (remove efeito e `carregandoMetaRemessas`). `contarUnidadesTransferenciaPorLoteSep` + faixa âmbar quando transferência tem mais unidades do que linhas em `etiquetas`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Etiquetas: remessa ainda sem «origem → destino» no select
- **Causa:** algumas viagens tinham meta só em `transferencias` com **tipo ≠ WAREHOUSE_STORE** (ou a linha matriz→loja não batia no 1º filtro); a meta ficava vazia e o rótulo caía em `SEP-xxxx`.
- **Mudança:** após carregar só `WAREHOUSE_STORE`, **2ª passagem** só para `viagem_id` ainda sem meta, **sem** filtrar `tipo`; entre várias linhas da mesma viagem prioriza `WAREHOUSE_STORE` e depois a mais recente. Helpers `metaPorViagemFromLinhasTransferencia` / `escolherLinhaTransferenciaPreferida`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Etiquetas: select mostrava UUID em vez de «… → Loja JK»
- **Causa:** o lote continua **`SEP-{id da viagem}`** (UUID); o texto legível (**matriz → nome da loja**, ex. JK) vem da meta em `transferencias`. Se o UUID em `etiquetas.lote` e o retorno de `viagem_id` diferiam em **maiúsculas/minúsculas**, o `Map` não achava a meta e caía no fallback com o UUID longo. Além disso, falha em **um** chunk da busca de meta apagava toda a meta (catch global).
- **Mudança:** `parseViagemIdDeLoteSep` normaliza em **minúsculas**; chaves da meta idem; chunk com erro só registra `warn` e segue; fallback do `<option>` usa **`loteSepResumidoParaUi`** (SEP + 1º bloco do UUID), não o UUID inteiro.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Etiquetas: lista de remessas lenta / «pesquisando» sem fim
- **Causa:** `buscarOpcoesRemessaSepParaEtiquetas` lia até **10 mil linhas** de `etiquetas` só para montar o select (cada remessa tem N linhas → poucos lotes distintos, payload enorme). Meta das remessas: um `.in('viagem_id', …)` com até **200 UUID** podia estourar URL ou demorar. Com `maxRows`, o hook buscava páginas **só em série**.
- **Mudança:** migração **`20260409120000_etiquetas_lotes_sep_recentes_rpc.sql`** — função `etiquetas_lotes_sep_recentes` (GROUP BY lote) + índice parcial; serviço chama a RPC e cai em fallback **2000** linhas se a RPC falhar. **Pula** o complemento por etiquetas quando já há **200** opções só de transferências. **`/etiquetas`:** meta em chunks de **45** `viagem_id` + `try/finally` no loading. **`useRealtimeQuery`:** faixas com `maxRows` em paralelo (4).
- **Impacto:** select de remessas e abertura de lote grande (ex.: Stock Delivery / CEP) ficam muito mais rápidos após aplicar a migração no Supabase.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Impressão Pi: remessas grandes (multi-job + QRs em lotes)
- **Problema:** um único HTML com centenas de etiquetas virava payload WebSocket enorme; `Promise.all` em todos os QRs estourava memória no browser; timeout fixo de 120 s era curto para jobs grandes.
- **Mudança:** `enviarEtiquetasParaPiEmMultiplosJobs` em `pi-print-ws-client.ts` (padrão ~40 etiquetas/job, `jobName` `base i/N`, `timeoutMs` até 10 min proporcional ao lote, delay ~350 ms entre jobs). `gerarDocumentoHtmlEtiquetas` gera data URLs dos QRs em **fatias** de 28. Integrado em **Separar por Loja**, **`/etiquetas`** e **`/producao`** (Pi).
- **Impacto:** escala melhor para remessas 200–400+ unidades (ex.: estoque → delivery / JK) sem um único job monolítico.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Criar separação: 400+ itens travava (query-string)
- **Causa:** `criarTransferencia` validava todos os `item_id` num único `.in('id', …)` — URL do PostgREST estourava / demorava indefinidamente; `insert` em `transferencia_itens` sem checar `error`.
- **Mudança:** validação e `insert` em **chunks** (100 / 150); rollback `delete` da `transferencias` se falhar o vínculo; `Separar por Loja`: texto de etapa ao salvar + `confirm` extra se mais de 150 itens.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Separar por Loja (manual): campo Qtd e rolagem da tabela
- **Problema:** em telas estreitas / mobile, difícil usar quantidade ou o **+**; `type="number"` e wrapper do `Input` atrapalhavam.
- **Mudança:** `input` texto com `inputMode="numeric"`, só dígitos; `overflow-x-auto` + `min-w` na tabela; `adicionarUnidadesPorProduto` recebe `livreMax` e limita a quantidade; saldo total com fallback se `Number` falhar.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Separar por Loja (manual): emitir QR do lote ao adicionar
- **Problema:** produto só com saldo em lote (ex.: detergente) não entrava na lista — faltava mint antes do **+**.
- **Mudança:** `adicionarUnidadesPorProduto` chama `emitirUnidadesCompraFifo` para a diferença; exige `usuario.id`; **Livre** = total agregado − na lista; textos de ajuda; recarrega tabela após sucesso.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Separar por Loja (manual): coluna «Livre» vs saldo só em lote
- **Problema:** resumo mostrava saldo alto (ex.: 54) mas **Adicionar** falhava com 0 unidades — o total agregado incluía **lote sem QR**; só existem linhas em `itens` para separação.
- **Mudança:** `contarItensComQrPorProdutosNoLocal` em `itens.ts`; tabela manual: colunas **Total** / **Com QR** / Lista / **Livre** (derivada de Com QR); textos de ajuda e erro mais claros.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Correção de dados: Galvanotek + Porta talher (1 QR = 1 caixa)
- **Problema:** potes e porta talher estavam com milhares de `itens`/QR (fator peças por caixa); estoque real era **27 / 19 / 9 caixas**.
- **Ação (Supabase, MCP `execute_sql`):** transação — manter os N itens `EM_ESTOQUE` mais antigos por produto; `DELETE` do excesso; `lotes_compra.quantidade` e `custo_unitario` alinhados à caixa; remoção de lotes vazios; `produtos` (nomes Galvanotek 30/60 ml, `custo_referencia` 112 / 126 / 286,98); `estoque` upsert.
- **Código:** `entrada-compra` — ao mudar de **Unidade** para **Caixa/Fardo**, força **«Unidades rastreáveis por embalagem» = 1** (evita arrastar fator errado). Registro: `docs/consultas-sql/correcao-galvanotek-porta-talher-2026-04-09.sql` + README da pasta.
- **Impacto:** saldo agregado e lotes batem com caixas físicas; novas compras devem usar **Caixa** + fator **1** + custo por caixa.
- **Validação:** consultas pós-SQL (27/19/9, lotes); `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Diagnóstico: erro `data_validade` em Registrar Compra (produção)
- **Sintoma:** alerta PostgREST «Could not find the 'data_validade' column of 'lotes_compra' in the schema cache» ao salvar em `/entrada-compra` (ex.: sem NF, contagem).
- **Causa:** código e `schema_public.sql` já esperam `lotes_compra.data_validade` (migração `20260408100000_compra_sem_qr_resumo_estoque.sql`); o **projeto Supabase de produção** aparenta não ter essa migração aplicada (app à frente do banco).
- **Ação (feita):** migração aplicada via **MCP Supabase** (`apply_migration`) no projeto alinhado ao `.env.local` — coluna `data_validade` (tipo `date`), índice `idx_lotes_compra_produto_local_created`, funções `resumo_estoque_agrupado` / `resumo_estoque_minimo` + `GRANT`.
- **Validação:** `information_schema` confirma `lotes_compra.data_validade`; repetir **Registrar compra** no app.

### Sessão - 2026-04-09 - Unidade de rastreio: caixa com muitas peças, um QR
- **Problema:** compra em caixa com centenas de peças internas gerava igual número de unidades no lote e, na separação, QRs demais para a loja.
- **Mudança:** `entrada-compra`: permite **1** em «Unidades rastreáveis por embalagem» (antes mínimo 2); textos de ajuda, resumo e confirmação alinhados a «unidade rastreável ≠ peça dentro da caixa»; aviso âmbar se fator por embalagem **> 50**; dica no hint de estoque. `ProdutoModal`: nota no bloco estoque mínimo. SQL de diagnóstico/notas: `docs/consultas-sql/caixa-unidade-rastreio-legado.sql` + README da pasta. `APP_LOGICA.md`, `CONTEXTO_ATUAL.md`.
- **Impacto:** operação pode registrar **uma caixa = uma unidade rastreável** sem mudar o modelo `itens`/QR.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Cadastros → Produtos: lista sem N+1
- **Problema:** após carregar todos os produtos, o `transform` do `useRealtimeQuery` fazia **2 consultas por produto** (`produto_grupos` e `conservacoes`).
- **Mudança:** serviço `fetchProdutosCadastroLista` (`produtos-cadastro-lista.ts`) — embeds em uma query + fallback `.in` em lotes; página com estado local, realtime Supabase (debounce), primeira carga vs. recarga silenciosa, filtro ativo/inativo, faixa de erro e **Tentar de novo**; recarga após salvar/excluir.
- **Impacto:** menos idas ao Supabase e carregamento mais rápido em bases grandes.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Viagem / Aceite: confirmação no app + um só fluxo pendente
- **UX:** removido «Só aceitar»; pendente só **Aceitar e iniciar agora** (abre `Modal`). **Iniciar viagem** (estado `ACCEPTED` legado) usa o mesmo modal. Sem `window.confirm` / `alert`; erro em faixa vermelha com Fechar. Modal não fecha por overlay/ESC enquanto **Processando…**
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Viagem / Aceite: resposta imediata e fluxo no celular
- **Problema:** após aceitar/iniciar, a tela parecia “não fazer nada” e depois atualizava — `useRealtimeQuery` ligava `loading` em todo refetch (sumia a página) e faltava feedback explícito.
- **Mudança:** opção `preserveDataWhileRefetching` no hook; `/viagem-aceite` usa `maxRows` + refetch após mutação; faixa de sucesso; **Aceitar e iniciar agora** + **Só aceitar**; confirmações mais claras; botões desabilitam enquanto remessas carregam. `viagens.ts`: erros nas `update` do aceite; `iniciarViagem` com `Promise.all` nas remessas.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Validade: modelo avançado (banner + badge, janela 3 dias)
- **Objetivo:** avisar ao abrir o app sem alterar o layout da home — faixa sob o header + ícone **Validades** com contador no `MobileHeader`.
- **Código:** `ValidadeAlertProvider` + `ValidadeBanner` (`src/components/validade/`); `listarItensAlertaValidade` com **3 dias** para «a vencer» + vencidos; severidade **crítico** / **atenção**; dismiss por `sessionStorage` até mudar contagens; removido `HomeAlertasValidade` da home.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Home: alertas de validade mais compactos
- **UI:** cabeçalho em uma linha (ícone pequeno, «Validade · Matriz/Loja/Rede», contagens abreviadas, link **Ver tudo**); até **3** linhas de prévia; texto **«Vence em N dia(s)»** (e **Vence hoje**); padding reduzido.
- **Validação:** `npm run lint`.

### Sessão - 2026-04-09 - Home: alertas de validade por escopo (loja / indústria / rede)
- **Objetivo:** na **home**, aviso visível de itens vencidos e a vencer (7 dias) para o funcionário acompanhar o que **ele** contabiliza fisicamente.
- **Código:** componente `HomeAlertasValidade` — `escopoValidadesPorPerfil` + `listarItensAlertaValidade` (limites 80/80), `hasAccessWithMap` para `/validades`; prévia de linhas + **Ver tudo** → `/validades`; sem alertas não renderiza o cartão.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-09 - Validades: botão/tela funcional e escopo por perfil
- **Problema:** `/validades` usava `useRealtimeQuery` em **todos** os `itens` (paginação completa), o que podia travar ou não concluir em bases grandes; escopo de indústria não era explícito.
- **Mudança:** serviço `listarItensAlertaValidade` (`validades-itens.ts`) — só `EM_ESTOQUE`, validade real (`< 2100`), vencidos + janela de N dias, limite de linhas; filtro opcional por `local_atual_id`. `escopoValidadesPorPerfil` em `operador-loja-scope.ts`: loja, indústria (local padrão) ou todos os locais (MANAGER/ADMIN_MASTER). UI: textos por contexto, **Atualizar**, refresh ~90 s.
- **Impacto:** cada perfil vê só o que vence **no seu** estoque físico (loja ou matriz) ou visão consolidada para gerência.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - BALDE Nº SEP: impressão sem `destino_id` não renumerava
- **Problema:** após lógica 1..N por lote `SEP-…`, etiquetas ainda saíam 1,1,2,2… se **`garantirNumeros`** não rodava: exigia `destinoLocalId` e o upsert SEP também exigia `destino` — meta da transferência atrasada ou primeira linha errada → `numerosMap` null → HTML usava `numero_sequencia_loja` antigo do banco.
- **Mudança:** renumerar remessa **SEP-** em `upsertEtiquetasSeparacaoLoja` **sem** depender de `local_destino_id`; **`garantirNumerosSequenciaBaldeAntesImpressao`** sempre chama upsert em lote `SEP-` (só exige lista não vazia). Meta em `/etiquetas`: transferências `WAREHOUSE_STORE` por `viagem_id`, escolhe a **mais recente** por `created_at` quando há várias.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - BALDE Nº remessa SEP: 1..N por lote (fim 1,1,2,2)
- **Problema:** na JK, etiquetas 60×60 do lote `SEP-…` saíam **BALDE Nº** repetido (1,1,2,2…5,5) em vez de 1..10.
- **Causa:** dois upserts (ex.: metade da remessa + sync ou impressão parcial) chamavam `reservar_sequencia_balde_loja` com **5** unidades cada — dois blocos **1–5** no contador global.
- **Mudança:** em `upsertEtiquetasSeparacaoLoja`, lote **`SEP-`** + loja de destino: numerar baldes **só pela remessa** — união de etiquetas ativas do lote + payload, ordenação por `item_id`, **1..N**; **não** usa RPC nesse caminho. Lotes **`SEPARACAO-LOJA`** mantêm RPC global. Itens do payload deduplicados por `id`; `idsPrecisamNumero` legado também deduplicado.
- **Validação:** `npm run lint`, `npm run build`. **Corrigir dados já gravados:** nova impressão/sync na remessa `SEP-…` regrava `numero_sequencia_loja`.

### Sessão - 2026-04-08 - JK: 10 unidades vs 5 etiquetas — sync por viagem + anti-duplicata
- **Problema:** painel Etiquetas mostrava **5** linhas para lote `SEP-…` enquanto o envio indicava **10** baldes; operação precisa das **10** etiquetas para a loja JK.
- **Causa provável:** (1) **duas transferências** `WAREHOUSE_STORE` na mesma `viagem_id` com itens **espalhados** — a sync antiga só lia **uma** transferência; (2) **mesmo** `item_id` duas vezes em `transferencia_itens` inflava «unidades» no resumo mas só **5** linhas em `etiquetas` (PK = `item_id`).
- **Código:** `sincronizarEtiquetasRemessaPorLoteSep` passa a unir **todos** os itens de **todas** as transferências da viagem com **destino_id** único; valida destinos divergentes; deduplica `item_id`; exige que `itens` retorne o mesmo total. `criarTransferencia` rejeita lista com **item repetido**. `envios-matriz-lojas` conta **unidades distintas** por `item_id`. `/etiquetas`: bloco âmbar de sync **sempre** em remessa `SEP-…` (texto se já há etiquetas). Migração `20260408203000_transferencia_itens_unique_item.sql` + `schema_public.sql`.
- **Validação:** `npm run lint`, `npm run build`. **Deploy:** aplicar migração no Supabase; em remessa afetada, usar **Gravar etiquetas a partir da transferência** com login/senha.

### Sessão - 2026-04-08 - Etiquetas: 10 unidades vs «5 impressões» + sync remessa
- **Operação:** remessa Indústria → Loja JK, **10** baldes, lote `SEP-7cec353d-…` — na prática relataram **5** «etiquetas».
- **Explicação provável:** fluxo **Separar por Loja** usa **60×30** = **duas meias-etiquetas por folha**; **10 unidades = 5 folhas** na Zebra. Contar **folhas** como se fossem **unidades** gera essa diferença.
- **Outras verificações:** em `/etiquetas`, filtro **Pendentes** só imprime o que ainda não está `impressa`; usar **Todas** ou **Zebra — remessa inteira** garante as 10 linhas se o banco tiver 10 registros.
- **Código:** `sincronizarEtiquetasRemessaPorLoteSep` deixou de usar `.limit(1)` sem ordem (Postgres sem `ORDER BY` = linha arbitrária). Com **várias** `transferencias` `WAREHOUSE_STORE` no mesmo `viagem_id`, escolhe a transferência com **mais** linhas em `transferencia_itens` e, em empate, a **mais recente** por `created_at`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Pi + Supabase: fila CUPS 60×60 e linha `industria`
- **Causa metade da etiqueta:** fila `ZebraZD220` com **PageSize=Custom.60x30mm**; o app em 60×60 fazia fallback para ponte **estoque** e enviava **`queue=ZebraZD220`** no WebSocket (ignorava `.env` do Pi).
- **Pi (`kim`):** criada fila **`ZebraZD220-6060`** (mesmo USB), **DefaultPageSize Custom.60x60mm**; `CUPS_QUEUE=ZebraZD220-6060` no `.env` do `pi-print-ws`; `systemctl restart pi-print-ws`.
- **Supabase:** `config_impressao_pi` linha **`industria`** preenchida com mesmo `wss`/`ws_token` da **estoque** e **`cups_queue` = `ZebraZD220-6060`** (estoque mantém `ZebraZD220` para 60×30).
- **Validação:** `lpoptions` / PPD; `execute_sql` MCP.

### Sessão - 2026-04-08 - Doc CUPS Zebra 60×60 mm no Raspberry
- **Conteúdo:** `docs/CUPS_ZEBRA_60X60.md` (web CUPS, segunda fila USB, `lpoptions`); `scripts/pi-print-ws/cups-adicionar-fila-60x60.sh`; `env.example` com `CUPS_QUEUE=ZebraZD220-6060`; links em `RASPBERRY_INDUSTRIA_NOVO_PI.md`, `IMPRESSAO_TERMICA_ZEBRA.md`, `README.md`; `CONTEXTO_ATUAL.md`.
- **Validação:** `bash -n` no script.

### Sessão - 2026-04-08 - Etiquetas: padrão 60×60 e aviso SEP vs mídia quadrada
- **Problema:** impressão em adesivo **60×60** com formato **60×30** no app → PDF **60×30** (duas meias); na Zebra parecia **faixa 30×60** e metade do adesivo vazio.
- **Mudança:** padrão de formato **60×60** (estado inicial + `localStorage` inválido + `obterFormatoImpressaoPadrao`); rótulo do 60×30 deixa claro que não é para adesivo quadrado inteiro; banner âmbar em remessa **SEP-…** quando 60×30 estiver selecionado.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Pi `pi-print-ws`: padrão de folha 60×60 mm (não 60×30)
- **Problema:** com fallback antigo **60×30** no `server.mjs`, impressão em mídia **60×60** saía como meia etiqueta preenchida e metade vazia.
- **Mudança:** defaults **60×60**; variáveis **`PRINT_DEFAULT_WIDTH_MM`** / **`PRINT_DEFAULT_HEIGHT_MM`** para Pi só de separação 60×30; `env.example` em `scripts/pi-print-ws/`; cliente WebSocket sem `formatoEtiquetaPdf` passa a enviar **60×60** por padrão.
- **Validação:** `npm run lint`, `npm run build`. **Deploy Pi:** copiar `server.mjs` + reiniciar `pi-print-ws`.

### Sessão - 2026-04-08 - Impressão 60×60 na Zebra: uma folha por etiqueta (viewport Pi)
- **Problema:** PDF gerado no Raspberry saía com conteúdo **minúsculo no canto** da etiqueta física 60×60 (viewport padrão do Chromium ~800×600 + `@page` 60 mm).
- **`pi-print-ws/server.mjs`:** `setViewport` em px a partir de `widthMm`/`heightMm` do JSON; `emulateMediaType('print')` antes do `page.pdf`.
- **Front:** `enviarHtmlParaPiPrintBridge` envia `formatoEtiquetaPdf` → dimensões do `FORMATO_CONFIG`; HTML 60×60 com wrapper **`.folha-6060`** (60×60 mm + `page-break`) e etiqueta **100%** da folha.
- **Deploy:** atualizar o script `server.mjs` no Pi (reiniciar `pi-print-ws`).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - `/etiquetas`: Pi 60×60 com fallback para ponte estoque
- **Problema:** com formato **60×60**, só se resolvia `usePiPrintBridgeConfig({ papel: 'industria' })`; quem tem **apenas** a ponte **estoque** via Supabase/env ficava com **Zebra desabilitada** (botão inativo).
- **Correção:** carregar **estoque** e **indústria** em paralelo; em **60×60** usar conexão **indústria** ou, se ausente, **estoque**; aviso âmbar + tooltips; texto de ajuda no topo da página.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiqueta 60×60 indústria: hierarquia, lote curto, rodapé no fundo
- **Problema:** na impressão 60×60 o bloco legal (empresa/CNPJ) e tokens pareciam “no topo” na leitura operacional; **loja** duplicada ao lado do QR; **lote** `SEP-{uuid}` longo demais na térmica.
- **Mudança (`label-print`):** HTML/CSS dedicados (`e6060-*`): **produto → loja → balde → RESFRIADO** primeiro; **Validade + Gerou** ao lado do QR; **tokens + lote**; **`margin-top: auto`** no bloco legal para grudar no fundo. Helper `formatarLoteExibicao6060` (ex.: `SEP-2697e6df` a partir de `SEP-2697e6df-…-uuid`).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - `/etiquetas`: gravar sequência de balde na hora da impressão
- **Problema:** impressão pela tela **Etiquetas** só lia `numero_sequencia_loja` do banco; remessas antigas ou criadas sem upsert com destino ficavam **sem BALDE Nº** na etiqueta.
- **Correção:** antes de gerar HTML (navegador e Pi), `upsertEtiquetasSeparacaoLoja` com `destino_id` da transferência (`meta` passa a carregar `destino_id`). `rowsParaEtiquetasImpressao` aceita `Map` devolvido pelo upsert.
- **Regra balde:** participa quem tem **«balde»** no nome do produto (não depende mais de `origem` no cadastro).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiqueta 60×30/60×60: Balde nº visível + layout proporcional
- **60×30:** `BALDE Nº` no **rodapé** (acima de Val./Op.); QR **11,8 mm**; paddings e fontes reduzidos para caber na meia-etiqueta; produto até 32 caracteres; operador truncado mais curto.
- **60×60:** faixa **BALDE Nº** no **topo** (abaixo da loja); removido bloco duplicado ao lado do QR; topo/RESFRIADO um pouco mais compactos.
- **Teste impressão:** amostras com número de balde de exemplo.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Sequência numérica de baldes por loja (indústria → filial)
- **Objetivo:** na separação matriz → loja, numerar baldes de uso na filial de forma **contínua por loja** (ex.: 1–5 na primeira remessa, 6–10 na seguinte).
- **Banco:** coluna `etiquetas.numero_sequencia_loja`; tabela `sequencia_balde_loja_destino`; RPC `reservar_sequencia_balde_loja` (transação com `FOR UPDATE`). Migração `20260408133000_sequencia_balde_loja_destino.sql` **aplicada no Supabase** (MCP `apply_migration`, nome `sequencia_balde_loja_destino`).
- **Regra MVP «é balde»:** `produtos.origem` ≠ `COMPRA` e nome contém **«balde»** (case insensitive) — `produto-sequencia-balde-loja.ts`.
- **`upsertEtiquetasSeparacaoLoja`:** recebe `local_destino_id`; preserva número já gravado; atribui bloco novo aos itens elegíveis sem número. `sincronizarEtiquetasRemessaPorLoteSep` passa `destino_id` da transferência.
- **UI:** `label-print` 60×30 e 60×60 exibem **Balde nº**; lista em `/etiquetas`; **Separar por Loja** + `ultima-remessa-storage` com `destinoLocalId`.
- **Validação:** `npm run lint`, `npm run build`. **Deploy:** aplicar a migração no Supabase (`docs/FLUXO_ENTREGA.md`).

### Sessão - 2026-04-08 - Etiqueta 60×30: validade + operador no rodapé; validade da remessa em `/etiquetas`
- **Problema:** impressão no formato **60×30** (loja / produto / data) só mostrava **data de impressão** (`08/04/2026`); **validade** e **operador** não apareciam — layout antigo da célula + `dataValidade` zerada na montagem quando o produto não tinha regra de validade no cadastro.
- **`label-print`:** `.cel-footer` com **Val. dd/mm/aa** (ignora sentinela `2999-…`) ou **Imp.** + data; linha **Op.** com `responsavel`.
- **`/etiquetas`:** `dataValidadeParaImpressaoEtiqueta` repassa `data_validade` do banco quando não é sentinela.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiqueta indústria 60×60: validade, loja e operador ao lado do QR
- **Layout 60×60** (`label-print.ts`): removida linha MANIPULAÇÃO e bloco RESP no rodapé esquerdo; **Validade** em **dd/mm/aa** + rótulos **Loja** e **Gerou** (`responsavel`) na coluna à esquerda do QR; nome da loja mantido no topo (`nome-loja-local`) e repetido na faixa do QR.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiquetas: formato 60×60 na Pi + nome da loja na remessa
- **Problema:** impressão com aparência repetida (produto/data/«—»): Pi e «remessa inteira» no navegador ignoravam o seletor e forçavam 60×30; `nomeLoja` não era preenchido nas linhas SEP.
- **`/etiquetas`:** Zebra/Pi e remessa inteira no navegador usam **`formatoImpressao`**; **60×60** → `usePiPrintBridgeConfig({ papel: 'industria' })` e `enviarHtmlParaPiPrintBridge` com o mesmo papel; **60×30** (e demais) → estoque. `rowsParaEtiquetasImpressao` recebe **destino** da remessa (`metaPorViagemId`) para 60×30 e 60×60.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiquetas: formulário de sync + status AWAITING_ACCEPT
- **UI** `/etiquetas`: bloco âmbar com **login** + **senha** (sem `prompt`/`confirm`); mensagem de sucesso verde; botão desabilitado sem credenciais.
- **`useRealtimeQuery`:** em erro de fetch/transform, `setData([])` para não manter lista defasada.
- **Transform etiquetas:** falha ao ler `itens` (tokens) não aborta a lista — aviso no console e QR com fallback.
- **`remessa-separacao-ui`:** `AWAITING_ACCEPT` legível como **«Aguardando aceite»** (alinhado a Separar por Loja).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiquetas: leitura sem embed + sync com service role
- **Problema:** remessa com 0 etiquetas na UI mesmo após «sincronizar» no cliente — possível **RLS** bloqueando `INSERT`/`UPDATE` com chave `anon` e/ou embed `itens!etiquetas_id_refs_itens_id_fkey` falhando no PostgREST.
- **`/etiquetas`:** `select` só `produto`; tokens QR via `itens` em lote no `transform` assíncrono.
- **API** `POST /api/operacional/sync-etiquetas-remessa`: valida login/senha (`operacional-auth-server.ts`), perfil indústria/gerente/admin, executa `sincronizarEtiquetasRemessaPorLoteSep` com `createSupabaseAdmin()`.
- **`etiquetas.ts`:** `upsertEtiquetasSeparacaoLoja` e `sincronizarEtiquetasRemessaPorLoteSep` aceitam `SupabaseClient` opcional.
- **`/api/auth/operacional`:** passa a usar `validarCredencialOperacional`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiquetas: sincronizar etiquetas a partir da transferência
- **Motivo:** remessa no painel de envios com **0** linhas em `etiquetas` ativas (descompasso transferência × etiquetas).
- **Serviço** `etiquetas.ts`: `sincronizarEtiquetasRemessaPorLoteSep` — resolve `viagem_id` do lote `SEP-…`, busca `transferencia_itens`, monta upsert alinhado a `itens` (chunks), modo `manter_impressa_se_existir`.
- **UI** `/etiquetas`: bloco âmbar + botão **Gerar etiquetas a partir da transferência** quando o lote é `SEP-…` e a lista carregada está vazia.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiquetas: select espelha envios (sem exigir linha em etiquetas)
- **Problema:** remessa listada em «Envios já registrados» (ex.: Santa Cruz) ainda sumia no `<select>` de **Etiquetas** — checagem extra em `etiquetas` podia excluir o lote; além disso operador indústria competia com transferências de outras origens no limite global.
- **Serviço** `etiquetas-opcoes-remessa.ts`: opções vindas **só** de `transferencias` (até **200**) + merge com scan em `etiquetas`; parâmetro `origemId` para filtrar pela indústria do operador (`OPERATOR_WAREHOUSE` / `DRIVER`).
- **UI** `/etiquetas`: `origemIdOpcoesRemessa` + refetch quando o usuário hidrata; texto de ajuda.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiquetas: select de remessa alinhado a Separar por Loja
- **Problema:** remessa visível em Separar por Loja (ex.: `SEP-…` Santa Cruz) não aparecia no `<select>` de **Etiquetas** — lista vinha só de scan em `etiquetas` com teto de **80** lotes distintos entre milhares de linhas.
- **Serviço** `etiquetas-opcoes-remessa.ts`: `buscarOpcoesRemessaSepParaEtiquetas` — até **150** transferências `WAREHOUSE_STORE` com `viagem_id`, filtra lotes com etiqueta `excluida = false`, ordena por data; merge com scan em `etiquetas` (até **10k** linhas) e teto **200** opções.
- **UI** `/etiquetas`: texto de ajuda atualizado.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Separar por Loja: editar destino e excluir remessa
- **UI** `/separar-por-loja`: em cada envio **Aguardando aceite** / **Aceita**, botões **Editar destino** (modal + `Select` de lojas) e **Excluir remessa** (`confirm`).
- **Serviço** `transferencias.ts`: `alterarDestinoRemessaMatrizParaLoja`, `cancelarRemessaMatrizParaLoja` — valida tipo `WAREHOUSE_STORE`, estado, unidades ainda `EM_ESTOQUE` na origem; cancelamento remove `transferencias` (cascade em `transferencia_itens`), marca `etiquetas` do lote `SEP-…` como `excluida`, remove `viagens` órfã; auditoria `ALTERAR_DESTINO_REMESSA_MATRIZ_LOJA` / `CANCELAR_REMESSA_MATRIZ_LOJA`.
- **`envios-matriz-lojas`:** resumo passa a incluir `origem_id` e `destino_id`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Cadastros Indústria vs envios em Separar por Loja
- **Motivo:** confundir «cadastro do dia» com «o que já foi mandado para a loja»; usuário queria cadastro do dia em **Cadastros (indústria)** e em **Separar por Loja** só o histórico de **envios** (produtos/unidades por remessa).
- **Nova rota** `/cadastros/industria` + componente `CadastrosIndustriaDiaPainel` (painel violeta movido para cá; **Editar** condicionado a permissão).
- **Serviço** `envios-matriz-lojas.ts` — `buscarEnviosRecentesMatrizParaLojas` (transferências `WAREHOUSE_STORE` + agregação por produto).
- **UI** `/separar-por-loja`: removido painel de cadastro do dia; adicionado painel **Envios já registrados** (filtra por origem; destino opcional).
- **Home + permissões:** card e `ROUTE_PERMISSIONS` / `ROUTE_UI_META` para `/cadastros/industria`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Separar por Loja: resumo do dia (Supabase) + editar cadastros
- **Objetivo:** ver na própria tela o que foi cadastrado/alterado **hoje** (fuso do navegador) no Supabase para alimentar separação, com link para editar.
- **Serviço:** `cadastros-hoje-separacao.ts` — `loja_produtos_config` (criado/updated hoje), `produtos` criados hoje (elegíveis reposição loja), `locais` STORE criados hoje.
- **UI** `/separar-por-loja`: card roxo com lista, **Atualizar**, **Editar** → Reposição (`?loja=`), Produtos (`?editar=`), Locais (`?editar=`).
- **Cadastros:** `reposicao-loja`, `produtos`, `locais` passam a honrar query string e abrir modal/seleção (URL limpa após aplicar).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiqueta indústria (60×60): loja/local, QR e validade
- **`label-print`:** template legado passa a exibir **`nomeLoja`** (na produção = nome do local do formulário), **QR** em bloco dedicado (bitmap 512 px) e **validade** reforçada na linha central + legenda **Val.** sob o QR (só 60×60).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiquetas: fluxo por remessa + UI estável
- **Problema:** página pesava ou «caía» ao tentar carregar muitas etiquetas de uma vez.
- **UI** `/etiquetas`: sem remessa selecionada, estado vazio orientando a escolher o lote; com remessa, spinner local enquanto carrega; filtros e grupos só após o fetch; botões «Imprimir pendentes» só com remessa carregada; botão **Atualizar lista** com ícone + texto também em loading; `useEffect` de meta de transferências com deps `[opcoesRemessa]` (lint).
- **Hook:** `useRealtimeQuery` com `enabled` false quando não há lote (sem loading infinito).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Etiquetas: performance (join itens + limite DOM por grupo)
- **Problema:** até 5000 linhas + transform assíncrono fazia **dezenas de round-trips** sequenciais a `itens` (chunks de 400).
- **Banco:** migração `20260408120000_etiquetas_fkey_itens_embed.sql` — FK `etiquetas.id` → `itens.id` (remove órfãs antes); `schema_public.sql` alinhado.
- **UI** `/etiquetas`: `select` embutido `item:itens!etiquetas_id_refs_itens_id_fkey(...)`; normalização leve de joins; **50** linhas visíveis por grupo com botão expandir; debounce realtime **800** ms; área de lista `max-h` um pouco maior.
- **Validação:** `npm run lint`, `npm run build`. **Deploy:** aplicar migração no Supabase de produção (sem FK o select embutido falha).

### Sessão - 2026-04-08 - Indústria: etiqueta produção 60×60 + Pi Zebra
- **`label-print`:** `FORMATO_ETIQUETA_INDUSTRIA` = **60×60** (QR ~22 mm); `confirmarImpressao` específico; `FORMATO_ETIQUETA_FLUXO_OPERACIONAL` continua 60×30 só para separação loja.
- **`/producao`:** impressão navegador e botão **Zebra / Pi (indústria)** (`usePiPrintBridgeConfig` `papel: industria`, `gerarDocumentoHtmlEtiquetas` + `enviarHtmlParaPiPrintBridge`); persistência **nome do local** para etiqueta após limpar formulário (`localParaImpressao`).
- **`/teste-impressao-etiqueta`:** com `?papel=industria`, formato inicial **60×60**.
- **Doc:** `docs/IMPRESSAO_TERMICA_ZEBRA.md` (§5 60×60), `docs/RASPBERRY_INDUSTRIA_NOVO_PI.md` (CUPS/mídia 60×60); `CONTEXTO_ATUAL.md` (bullet impressão).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Separar por loja (manual): ocultar insumos de compra por padrão
- **Motivo:** na indústria, modo manual listava toda a origem (ex.: polpa COMPRA + balde PRODUCAO); operador quer enviar só acabados.
- **UI** `/separar-por-loja`: após carregar `resumo_estoque_agrupado`, busca `origem` em `produtos`; **não** lista `origem === COMPRA` até marcar **«Mostrar também produtos só de compra»**; mensagem âmbar se só sobrar compra.
- **Validação:** `npm run lint`.

### Sessão - 2026-04-08 - Supabase MCP: aplicar migração produção (`local_id`, insumos)
- **Problema:** PostgREST retornava *Could not find the 'local_id' column of 'producoes' in the schema cache* — o banco ligado ao MCP ainda não tinha o DDL de `20260407183000_producao_consumo_insumos.sql`.
- **Aplicado no MCP:** `producoes.local_id`, `producoes.num_baldes` (NOT NULL, default 1; backfill `num_baldes = quantidade`); `baixas.producao_id` + índice; tabela `producao_consumo_itens` + RLS/policy + `supabase_realtime`.

### Sessão - 2026-04-08 - Supabase MCP: remover 2 baldes Açaí 11L (Indústria)
- **Banco (MCP):** removidos **2** `itens` (`df7ced01-…`, `56b96acb-…`) — produto **Açaí Balde 11L**, local **Indústria**, validade **30/04/2026** (UTC), ligados ao `lotes_compra` `1b16044d-…` (qtd 2, NF `SEM_NF_HISTORICO`); excluído o **lote** (não havia outros itens). Sem `transferencia_itens` / `baixas` / `perdas` nesses IDs.
- **Estoque agregado:** `estoque` do produto recalculado por contagem `EM_ESTOQUE` → **0**.

### Sessão - 2026-04-10 - Supabase MCP: último balde de teste (1 unidade)
- **Banco (MCP):** removidos `producoes` `ede8298e-…`, item acabado `efa6232e-…` e `etiquetas`; `estoque` recalculado para o produto do balde. Não havia linha em `producoes` com data 10/04 no MCP — era o único resto da limpeza anterior (validade na tela podia aparecer como 10/04).

### Sessão - 2026-04-08 - Supabase MCP: limpar produções/baldes de teste (>7 dias)
- **Banco (MCP):** removidas **16** linhas em `producoes` com `created_at` anterior a 7 dias; **524** itens acabado (sem `lote_compra`, casados por produto + janela de tempo); `etiquetas` correspondentes; **1** `transferencia_itens` + **1** `transferencias` de teste que referenciavam um desses itens.
- **Estoque agregado:** `UPDATE estoque` para os dois `produto_id` envolvidos (contagem `EM_ESTOQUE`).
- **Doc:** `docs/consultas-sql/limpar-producoes-teste-antigas.sql` (roteiro; execução foi via MCP).

### Sessão - 2026-04-08 - Produção: modal não fechar antes do submit; erros visíveis
- **Problema:** ao confirmar produção, o modal fechava antes de `handleSubmit` terminar; erros do Supabase nem sempre são `instanceof Error` (alert genérico «Erro»).
- **UI** `/producao`: confirmação só fecha após sucesso; mensagem de falha em vermelho no modal; texto «Registrando…»; aviso âmbar quando o botão está desabilitado (checklist do que falta).
- **Serviço:** auditoria de baixas da produção em lotes de 80 linhas (evita corpo HTTP grande com muitos insumos).
- **`errMessage`:** usa `details`/`hint` de erros estilo PostgREST.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-08 - Registrar compra: corrigir lançamento (lote) + revert Separar por Loja
- **Escopo:** o pedido era editar **entrada de compra** (quantidade/NF errados), não separação. **Separar por loja** restaurado ao último commit (`git checkout HEAD -- src/app/separar-por-loja/page.tsx`).
- **Serviço** `lotes-compra.ts`: `contarItensDoLoteCompra`, `atualizarLoteCompra` (validações NF/fornecedor/validade; quantidade ≥ QR já emitidos; `recalcularEstoqueProduto`; auditoria `ALTERAR_LOTE_COMPRA`).
- **UI** `/entrada-compra`: seção **Corrigir lançamentos recentes** (até 50 lotes) + modal **Editar** (qtd, custo, fornecedor, NF, validade).
- **Doc:** `CONTEXTO_ATUAL.md` (removido bullet equivocado de «editar lançamentos» em Separar por Loja).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-07 - Compra sem QR na entrada; emissão na saída
- **Regra:** `criarLoteCompra` só grava `lotes_compra` (com `data_validade`); não insere `itens`/`etiquetas`. Estoque agregado = itens `EM_ESTOQUE` + saldo “a etiquetar” por lote (`quantidade` − já emitidos).
- **Serviços:** `emitirUnidadesCompraFifo`, `garantirItensDisponiveisNoLocal` em `lotes-compra.ts`; `recalcularEstoqueProduto` em `estoque-sync.ts`; produção e **Separar por Loja** (manual, reposição e sugestão) chamam `garantir…` antes de usar unidades.
- **SQL:** migração `20260408100000_compra_sem_qr_resumo_estoque.sql` — coluna `lotes_compra.data_validade`; recria `resumo_estoque_agrupado` e `resumo_estoque_minimo` incluindo saldo de lote sem QR.
- **UI:** mensagens em **Registrar Compra**; realtime em **Estoque** também em `lotes_compra`.
- **Doc:** `APP_LOGICA.md`, `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.
- **Deploy:** aplicar migração no Supabase; se `DROP FUNCTION resumo_estoque_minimo` falhar por assinatura diferente, ajustar no SQL Editor.

### Sessão - 2026-04-07 - Produção: insumos gastos + baldes
- **Banco:** migração `20260407183000_producao_consumo_insumos.sql` — `producoes.local_id`, `producoes.num_baldes`, `baixas.producao_id`, tabela `producao_consumo_itens`; `schema_public.sql` e tipos em `database.ts`.
- **Serviço:** `registrarProducaoComItens` consome unidades por FEFO, insere baixas vinculadas, gera acabado; `contarItensDisponiveisLocal` em `itens.ts`.
- **UI:** `/producao` — linhas de insumo, baldes, disponível no local, modal com resumo.
- **Doc:** `APP_LOGICA.md`, `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.
- **Deploy:** aplicar a migração no Supabase de produção.

### Sessão - 2026-04-07 - Limpeza: viagens de teste (Supabase MCP)
- **Removidas** viagens `7fbb3c48…` e `8f09e7a2…` (teste); `transferencias`/`transferencia_itens` em cascata; **3 itens** voltaram a `EM_ESTOQUE` na origem.
- **Motivo:** não exibir mais em **Viagem / Aceite** para operadores (ex.: Leonardo).

### Sessão - 2026-04-07 - Viagem / Aceite: resumo e expansão por remessa
- **Tela** `/viagem-aceite`: bloco com origem, totais e lojas; botão **Ver produtos por remessa**; cada remessa expande **resumo por produto** e, ao clicar de novo, lista unitária (nome + token curto/QR). Labels de status da viagem e da transferência em português. Carga das transferências em `Promise.all` por viagem.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-07 - Reposição por loja: ativo na loja + filtro
- **Cadastros → Reposição de estoque por loja:** coluna **Na loja** (`ativo_na_loja`), badges ativos vs catálogo, filtro “Ocultar inativos”, **Salvar** grava mínimo e ativo em paralelo (`Promise.all`). Texto de ajuda alinhado a **Separar por Loja** e **contagem na loja** (já filtravam por `ativo_na_loja` no serviço).
- **Doc:** `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-06 - Recebimento: confirmar muitos itens mais rápido
- **Problema:** `receberTransferencia` fazia 2 atualizações Supabase por item escaneado (sequencial).
- **Código:** uma `update` em `transferencia_itens` com `.in('item_id', …)` e uma em `itens` para os IDs esperados; `sincronizarEstoquePorProdutos` passa a usar `Promise.all` por produto (também usado no despacho).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-06 - Railway: SUPABASE_SERVICE_ROLE_KEY em produção
- **Causa:** login em `controle.acaidokim.com.br` sem `SUPABASE_SERVICE_ROLE_KEY` no serviço Railway.
- **Correção:** variável definida no projeto Railway (produção); Railway tende a redeployar automaticamente.
- **Doc:** `docs/FLUXO_ENTREGA.md` e `README.md` — checklist de variáveis explicitando service role.

### Sessão - 2026-04-06 - Credencial Marco (Supabase MCP)
- **Banco:** `usuarios.login_operacional` = `full` e linha em `credenciais_login_operacional` (bcrypt) para Marco (`telefone` 550000000002), via SQL no projeto MCP.
- **Validação:** conferência pós-SQL (`tem_hash` true).

### Sessão - 2026-04-06 - Login só Supabase (sem legado no código)
- **Código:** removidos `credenciais-legado.ts` e `operacional-usuario-server.ts`. `POST /api/auth/operacional` valida apenas `usuarios.login_operacional` + `credenciais_login_operacional` (bcrypt); sem hash → 401 com orientação ao admin.
- **Ferramenta:** `npm run seed:operacional` + `scripts/seed-credenciais-operacionais.mjs`; `scripts/operacional-seed.example.json` (sem senhas reais); `scripts/operacional-seed.local.json` no `.gitignore`.
- **Doc:** `README.md`, `CONTEXTO_ATUAL.md` — sem tabela de senhas no repositório.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-06 - Login: senhas no banco (bcrypt) + Cadastro usuários
- **Banco:** `usuarios.login_operacional`, tabela `credenciais_login_operacional` (hash), RLS sem policy pública; migration `20260406203000_login_operacional_credenciais.sql` (aplicada no projeto MCP).
- **API:** `POST /api/auth/operacional` (login), `POST /api/admin/credencial-operacional` (só `ADMIN_MASTER`); `createSupabaseAdmin` + `bcryptjs`. (Fallback legado removido na sessão seguinte.)
- **Código:** cadastro **Usuários** com usuário/senha e opção remover credencial.
- **Deploy:** `SUPABASE_SERVICE_ROLE_KEY` obrigatória no Railway. **Validação:** `npm run lint`, `npm run build`.
- **Doc:** `README.md`, `CONTEXTO_ATUAL.md`, `schema_public.sql`.

### Sessão - 2026-04-06 - Supabase: usuarios operadoras loja + loja Jardim Paraíso
- **Banco (MCP):** criado `locais` **Loja Jardim Paraíso**; upsert **5× `usuarios`** (`OPERATOR_STORE`, telefones `550000000011`–`015`) com `local_padrao_id` por nome de loja.
- **Código:** `acesso.ts` — `lojaPadraoNome` **Delivery** e **Loja Imperador** alinhados ao cadastro real de `locais`.
- **Repo:** migration `20260406190000_loja_jardim_paraiso.sql`, `docs/consultas-sql/upsert-operadoras-loja.sql`, README e `CONTEXTO_ATUAL.md`.

### Sessão - 2026-04-06 - Etiquetas: select remessa sem nome de produto
- **Código:** `rotuloOpcaoSelectRemessa` — só data/hora · origem → destino · N etiqueta(s) (evita truncar nome de produto no dropdown).

### Sessão - 2026-04-06 - Etiquetas: remessa SEP legível (data, origem, destino, produtos)
- **Código:** busca `transferencias` por `viagem_id` extraído de `SEP-…`; painel e `<select>` com data/hora, indústria → loja, status da viagem, resumo de produtos; grupos por produto com mesma contextualização; `remessa-separacao-ui.ts`.
- **Validação:** `npm run lint`, `npm run build`.
- **Doc:** `CONTEXTO_ATUAL.md`.

### Sessão - 2026-04-06 - Etiquetas: Zebra remessa inteira (lote SEP-)
- **Código:** `ultima-remessa-storage.ts` (persistência compartilhada); `/etiquetas` agrega lotes `SEP-…`, painel com **Zebra / Pi — remessa inteira** + navegador 60×30; seletor se houver várias remessas na janela de 5000 etiquetas; `separar-por-loja` importa o mesmo módulo.
- **Validação:** `npm run lint`, `npm run build`.
- **Doc:** `CONTEXTO_ATUAL.md`.

### Sessão - 2026-04-06 - Separar por Loja: painel «Imprimir pedido completo» mais visível
- **Problema:** operador não encontrava o card «Última remessa».
- **Código:** persistência em **localStorage** (`v2`) + migração de `sessionStorage` legado; título **Imprimir pedido completo** (borda/ring), painel **acima** do aviso verde; texto de ajuda quando não há remessa; `scrollIntoView` após criar separação; validação de payload ao reler.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-06 - Separar por Loja: imprimir remessa inteira (Zebra / navegador)
- **Código:** após **Criar separação**, persistir última remessa (`lote` `SEP-…`, loja, snapshot de itens) em `sessionStorage`; card **Última remessa** com **Imprimir remessa inteira na Zebra (Pi)** e **Remessa inteira no navegador**; **Esquecer esta remessa** limpa estado.
- **Impacto:** um clique reenvia toda a sequência de etiquetas do pedido, sem remontar a lista na tela.
- **Validação:** `npm run lint`, `npm run build`.
- **Doc:** `CONTEXTO_ATUAL.md`.

### Sessão - 2026-04-06 - Etiquetas: impressão direta Zebra / Pi
- **Código:** `/etiquetas` — `usePiPrintBridgeConfig({ papel: 'estoque' })`, `rowsParaEtiquetasImpressao`, `imprimirListaNoPi` (HTML 60×30 + `enviarHtmlParaPiPrintBridge` + `marcarImpressa`); botões Zebra/Pi no topo, por grupo e ícone por linha; aviso HTTPS + `ws://` como nas outras telas; botão por linha **não** bloqueia etiqueta já impressa (reimpressão).
- **Impacto:** operador envia etiquetas listadas direto para CUPS/Zebra sem depender só da impressão do navegador.
- **Validação:** `npm run lint`, `npm run build`.
- **Doc:** `CONTEXTO_ATUAL.md`.

### Sessão - 2026-04-06 - Impressoras status: DoH + SNI (localhost ENOTFOUND)
- **Problema:** Node/`fetch` com `ENOTFOUND` para `print.acaidokim.com.br` no Mac/sandbox mesmo com zona DNS OK.
- **Código:** após `dns.setServers` + 2º `fetch`, terceiro caminho: **DoH** `https://1.1.1.1/dns-query` (JSON) + `https.request` ao IPv4 com `servername`/`Host` do hostname.
- **Validação:** `npm run dev` → `GET /api/impressoras/status?papel=estoque` → `online:true`; `npm run lint`, `npm run build`.
- **Doc:** `CONTEXTO_ATUAL.md`.

### Sessão - 2026-04-06 - Impressoras status: fallback DNS (Railway ENOTFOUND)
- **Problema:** `getaddrinfo ENOTFOUND print.acaidokim.com.br` no servidor apesar de DNS público OK (1.1.1.1 / 8.8.8.8).
- **Código:** `/api/impressoras/status` — em falha DNS provável, `dns.setServers` (1.1.1.1, 8.8.8.8 ou `PI_PRINT_STATUS_DNS_SERVERS`) e novo `fetch`.
- **Doc:** `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-06 - Pi: túnel nomeado Cloudflare + SSH (`print.acaidokim.com.br`)
- **API:** túnel **`pi-print-acaidokim`** (`3406c32f-fd37-4dff-9da8-41e88cef2976`), ingress **`print.acaidokim.com.br`** → `http://127.0.0.1:8765`.
- **Pi (SSH `kim@192.168.1.159`):** `cloudflared service install` + **`cloudflared.service`** ativo; **`cloudflared-pi-print-ws.service`** stop + disable (quick/sync).
- **Pendente:** CNAME **`print`** na zona **`acaidokim.com.br`** se DNS não propagar; atualizar **`ws_public_url`** / env Railway para **`wss://print.acaidokim.com.br`**. Token do conector no `ExecStart` do systemd — considerar rotação no painel se necessário.
- **Doc:** `CONTEXTO_ATUAL.md` atualizado.

### Sessão - 2026-04-06 - Pi impressão: URL estável por env (evitar ENOTFOUND quick tunnel)
- **Problema:** `ws_public_url` no Supabase com `*.trycloudflare.com` obsoleto → `ENOTFOUND` em Verificar agora / impressão.
- **Código:** módulo `pi-print-wss-env.ts`; ordem: `NEXT_PUBLIC_PI_PRINT_WS_URL` → `NEXT_PUBLIC_PI_PRINT_WS_URL_ESTOQUE` / `INDUSTRIA` → Supabase; `resolvePiPrintConnection` e `GET /api/impressoras/status` alinhados; resposta com `urlSource`; novo `GET /api/impressoras/url-source` para avisos na UI (quick no banco vs override por env).
- **UI:** Configurações → Impressoras — faixas verde (env ativa) e âmbar (risco quick só no Supabase).
- **Doc:** `IMPRESSAO_PI_ACESSO_REMOTO.md`, `README.md`, `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-06 - Railway: remoção manual + novo `railway up`
- **Contexto:** utilizador removeu deploys no dashboard; repo em `8157d7e` (`main` = `origin/main`).
- **Ação:** `railway up --detach` → deployment **`5bb93288-797d-4de8-84c0-b542929c529c`** (estado inicial **BUILDING** após upload).
- **Nota:** evitar `git push` logo a seguir para não criar segundo deploy (Git + CLI) na mesma fila.

### Sessão - 2026-04-06 - Railway: “não sobe” em 5 min — `DEPLOYING` + incidente
- **CLI:** deployment **`4e9aa2df`** em **`DEPLOYING`**; build Railpack **já OK** (~110 s); **Deploy logs** ainda vazios — típico com lentidão de plataforma (banner *builds slow to progress*).
- **Git:** `git push origin main` — `70edf0b` (só `LOG_SESSOES`) alinhado com `origin`; pode surgir novo deploy por Git — **cancelar duplicados** no painel se competirem com o `4e9aa2df`.
- **Nota:** 5 min em `DEPLOYING` durante incidente não indica falha do app; esperar ou acompanhar [status.railway.com](https://status.railway.com).

### Sessão - 2026-04-06 - Railway: fila limpa + `railway up` (último git)
- **Contexto:** utilizador removeu deploys em `QUEUED` no dashboard; repo local = `origin/main` em `d124ae3`.
- **Ação:** `railway up --detach` → novo deployment **BUILDING** (`4e9aa2df-…`); permaneceu um item **QUEUED** ligado ao Git (`61a62245-…`, commit `d124ae3`) — convém cancelar duplicado no painel se ambos competirem.
- **Validação:** `railway deployment list --json --limit 5` após o comando.

### Sessão - 2026-04-06 - Railway: investigação via MCP (`user-railway`)
- **MCP:** `check-railway-status` OK (CLI + login); `list-services` → 1 serviço **estoque-app**; `list-deployments` (json, limit 25/100) → **5 deployments `QUEUED`** no topo (GitHub `main`), todos **`queuedReason`: manutenção**, builder **RAILPACK**; commits mais recentes na fila incluem `fcfdc6a`, `9a1bed3`, `0b7f8db`, `8aaea55`, `7fe67a7`; deploys **Docker** antigos em **`REMOVED`**.
- **Logs:** `get-logs` (deploy, últimas linhas) sem conteúdo útil enquanto não há deploy em execução com sucesso na janela consultada.
- **Conclusão:** bloqueio atual é **lado Railway (fila/manutenção)** + **vários pushes**; mitigar com `railway:prune-queued` + evitar disparos duplicados.

### Sessão - 2026-04-06 - Railway: prune-queued + token de projeto (Project-Access-Token)
- **`RAILWAY_PROJECT_TOKEN`:** API GraphQL usa header `Project-Access-Token` (token criado em Project Settings → Tokens); `RAILWAY_TOKEN` continua para Bearer (conta/workspace).
- **Segurança:** tokens não vão para o Git; `.env.railway.local` no `.gitignore`; revogar token se exposto.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-06 - Railway: `railway:prune-queued` (API deploymentCancel)
- **Contexto:** fila com vários **QUEUED** (manutenção + commits em sequência); Docker no repo foi revertido; limpar duplicados na fila exige painel ou API.
- **Repo:** `scripts/railway-prune-queued.mjs`, `npm run railway:prune-queued` com `RAILWAY_TOKEN` (token conta/workspace); `--dry-run`, `--keep N`. Doc em `docs/FLUXO_ENTREGA.md`, `README`, `CONTEXTO`; `railway:diagnose` cita o comando.
- **Validação:** `npm run lint`, `npm run build`; dry-run do script OK.

### Sessão - 2026-04-06 - Railway: publicar `railway:diagnose` + nota CLI vs Git
- **Git:** commit do que estava pendente — `scripts/railway-diagnose.mjs`, `npm run railway:diagnose`, doc **Deploy não termina** + bullet **ACTIVE (CLI) vs QUEUED (GitHub)** em `docs/FLUXO_ENTREGA.md`; `README`, `CONTEXTO_ATUAL`.
- **Contexto:** dashboard com deploys **ACTIVE** por `railway up` e **QUEUED** por Git por manutenção.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-04 - Railway: deploy não termina (diagnóstico + doc)
- **Causa típica:** deploys **Docker** antigos em **`DEPLOYING`** enquanto commits novos ficam **`QUEUED`** (manutenção/fila); a CLI não cancela deployment preso.
- **Repo:** `scripts/railway-diagnose.mjs` + `npm run railway:diagnose`; seção **“Deploy não termina”** em `docs/FLUXO_ENTREGA.md` (dashboard → cancelar presos; `railway logs` por id).
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-04 - Railway: voltar ao Railpack + `railway:release`
- **Motivo:** deploys **Docker** ficaram em **INITIALIZING** / fila **QUEUED** (manutenção/backpressure); a CLI não cancela fila — caminho estável é **Railpack** (último `SUCCESS` histórico).
- **Repo:** removidos `Dockerfile`, `.dockerignore`, `railway.json`; `next.config.ts` sem `output: standalone`.
- **Automação:** `npm run railway:deploy`, `railway:wait`, `railway:release` + `scripts/railway-wait-deployment.mjs` (timeout `RAILWAY_WAIT_TIMEOUT_SEC`).
- **Doc:** `docs/FLUXO_ENTREGA.md`, `README.md`, `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build`.

### Sessão - 2026-04-06 - Railway: `railway.json` + deploy MCP
- **Motivo:** deployments na fila ainda apareciam com **RAILPACK** no manifest; `railway.toml` trocado por **`railway.json`** (`$schema` railway.com) para forçar **DOCKERFILE**.
- **MCP Railway:** `check-railway-status` OK; `list-deployments` (fila/manutenção/backpressure); `deploy` com upload do workspace.
- **Doc:** `FLUXO_ENTREGA`, `README`, `CONTEXTO_ATUAL`.

### Sessão - 2026-04-06 - Railway: Dockerfile + standalone + railway.toml
- **Build:** `Dockerfile` multi-stage (Node 20), Next `output: 'standalone'` em `next.config.ts`, `.dockerignore`.
- **Railway:** `railway.toml` — `builder = DOCKERFILE`, `startCommand = node server.js`, healthcheck `/`, `restartPolicyType = ON_FAILURE`.
- **Doc:** `docs/FLUXO_ENTREGA.md`, `README.md`, `CONTEXTO_ATUAL.md`.
- **Validação:** `npm run lint`, `npm run build` (com env fictícia). Imagem Docker não testada neste ambiente (Docker indisponível).

### Sessão - 2026-04-06 - Pi: túnel permanente (doc) + sync quick com retentativas
- **Doc:** `docs/TUNEL_PERMANENTE_PRINT_PI.md` — túnel nomeado Cloudflare para `wss://` fixo; quick + RPC já atualiza o banco sozinho (sem colar URL), com limitação de hostname rotativo.
- **Script:** `cloudflared-quick-tunnel-sync.sh` — retentativas na RPC (`PI_TUNNEL_SYNC_RETRIES`, padrão 5), `grep` para URL trycloudflare, log se faltar `.env`; exemplos `cloudflared-config-named-tunnel.example.yml` e `cloudflared-named-tunnel.service.example`.
- **UI:** faixa em **Configurações → Impressoras** com link ao guia; `IMPRESSAO_PI_ACESSO_REMOTO.md` e `CONTEXTO_ATUAL.md` atualizados.
- **Validação:** `npm run lint` e `npm run build`.

### Sessão - 2026-04-06 - Impressoras: ajuda ENOTFOUND + doc deploy / localhost
- **UI:** `configuracoes/impressoras` — caixa explicativa quando a verificação retorna ENOTFOUND (túnel quick / Supabase).
- **Doc:** `FLUXO_ENTREGA.md` (tempo de deploy Railway, evitar push + `railway up` duplicado); `IMPRESSAO_PI_ACESSO_REMOTO.md` (localhost + trycloudflare).
- **CONTEXTO_ATUAL.md** alinhado.
- **Validação:** `npm run lint` e `npm run build`.

### Sessão - 2026-04-06 - Deploy + teste API impressoras + fallback mensagem
- **Git:** push `389db02` + `183ab98` (`main`); `railway up --detach` após cada bloco relevante. Domínios: `estoque-app-production.up.railway.app`, `controle.acaidokim.com.br`.
- **Teste:** `GET /api/impressoras/status?papel=estoque` em produção → `online:false` (túnel no banco com host que não resolve). Dev local com código novo → mensagem com `ENOTFOUND` + hostname.
- **Código:** fallback em `route.ts` quando a mensagem é só `fetch failed` (runtime sem `cause`), incluindo host do health URL.
- **Validação:** `npm run lint` e `npm run build`.

### Sessão - 2026-04-06 - Pi impressão: diagnóstico `fetch failed` na verificação
- **`/api/impressoras/status`:** mensagem de erro passa a incluir `error.cause` do Node (ex. `ENOTFOUND`, `ECONNREFUSED`) via `formatNodeFetchError` em `errMessage.ts`.
- **Doc:** seção em `docs/IMPRESSAO_PI_ACESSO_REMOTO.md` + bullet em `CONTEXTO_ATUAL.md` (Verificar agora ≠ teste da Zebra USB).
- **Validação:** `npm run lint` e `npm run build`.

### Sessão - 2026-04-06 - Deploy: push `main` (Railway via Git)
- **Git:** commit `7d91307` em `main` — separação manual por estoque, QR sob demanda, docs.
- **Push:** `origin/main` atualizado; CI GitHub Actions e deploy Railway seguem o que estiver ligado ao repositório.
- **Validação:** conferir dashboard Railway e run do workflow em GitHub.

### Sessão - 2026-04-06 - QR: leitor só sob demanda
- **`QRScanner`:** padrão sem `autoOpen`; label padrão **Ativar leitor de QR (câmera)**. Removido `autoOpen` em baixa diária, recebimento, separar por loja, `/qrcode` e rastreio por QR.
- **Doc:** `CONTEXTO_ATUAL.md` (UX de câmera).
- **Validação:** `npm run lint` e `npm run build`.

### Sessão - 2026-04-05 - Separar por Loja: manual por estoque + doc ciclo do QR
- **App:** modo **manual** passa a listar produtos com saldo na **origem** (`getResumoEstoqueAgrupado`), filtro + tabela (origem / já na lista / livre), quantidade e botão para adicionar unidades sem escanear (até 3000 linhas consultadas por produto, FEFO). Scanner/digitação movidos para bloco opcional; texto explica fluxo real (QR físico na separação).
- **Doc:** `CONTEXTO_ATUAL.md` — ciclo operacional do QR matriz→loja e descrição do manual atualizado.
- **Validação:** `npm run lint` e `npm run build`.

### Sessão - 2026-04-05 - CONTEXTO: visão de produto (north star)
- **Doc:** inclusão da seção **Visão de produto (north star)** em `CONTEXTO_ATUAL.md` — missão matriz→filial, uso interno evoluindo para SaaS/multi-segmento, venda por QR com funcionário como conferente, direção fiscal (NF por imagem → dados no servidor → apoio tributário), roadmap de intenção em três eixos.
- **Impacto:** alinha documentação canônica ao propósito de longo prazo do app; sem mudança de código ou banco.
- **Validação:** revisão de texto; `npm run lint` e `npm run build` OK.

### Sessão - 2026-04-03 - Doc: novo Raspberry indústria (`RASPBERRY_INDUSTRIA_NOVO_PI.md`)
- **Doc:** guia operacional para segundo Pi (`papel = industria`): o que passar sem SSH, checklist físico, pacotes, `.env` com `PI_TUNNEL_PAPEL`, systemd, validação e troubleshooting; link em `IMPRESSAO_PI_ACESSO_REMOTO.md` e `CONTEXTO_ATUAL.md`.
- **Validação:** revisão interna do texto; sem alteração de código.

### Sessão - 2026-04-03 - Config impressoras: duas pontes Pi (estoque / indústria)
- **Banco:** migração `20260406120000_config_impressao_pi_papel.sql` — coluna `papel` (única), linha **industria** + `tunnel_sync_secret` próprio; RPC `sync_pi_tunnel_ws_url` com `p_papel` (default estoque); `GRANT UPDATE` em URL/token/fila para anon (tela de config).
- **App:** `/configuracoes/impressoras` (ADMIN_MASTER/MANAGER); `GET /api/impressoras/status?papel=` (health do túnel); `resolvePiPrintConnection` / `usePiPrintBridgeConfig({ papel })`; Separar por Loja → **estoque**; teste de impressão com `?papel=industria` opcional.
- **Pi:** `cloudflared-quick-tunnel-sync.sh` envia `p_papel` a partir de **`PI_TUNNEL_PAPEL`** (padrão estoque).
- **Docs:** `docs/IMPRESSAO_PI_ACESSO_REMOTO.md`, `docs/consultas-sql/config-impressao-pi.sql`.
- **Validação:** `npm run lint` e `npm run build` OK. Migração aplicada no Supabase via MCP neste ambiente.

### Sessão - 2026-04-05 - ESLint: projeto sem erros + CI com `npm run lint`
- **Código:** substituição de `any` em catches e joins Supabase; `errMessage()` em `src/lib/errMessage.ts`; tipos em `ProdutoModal`, `useRealtimeQuery`, serviços e páginas; `eslint-disable` pontual (`react-hooks/set-state-in-effect`, `exhaustive-deps`, PostgREST dinâmico).
- **Config:** `eslint.config.mjs` ignora `supabase/run-schema*.mjs`.
- **CI:** `.github/workflows/ci.yml` passa a executar **ESLint** antes do build.
- **Validação:** `npm run lint` e `npm run build` OK.

### Sessão - 2026-04-05 - Git: push main impressão Pi + migrações
- **Commit** `a55960b` em `main`: impressão via Pi (WS), `config_impressao_pi`, RPC de sync do túnel, scripts `pi-print-ws`, docs e ajustes de tipo em `separar-por-loja` / `label-print` / `database.ts`.
- **Testes:** `npm run build` OK; `eslint` nos ficheiros tocados neste commit OK. O `npm run lint` global do repo ainda acusa erros antigos em outras páginas (CI só roda build).
- **Push:** `origin/main` atualizado (`github.com/mdappsconsult/estoque-app`).

### Sessão - 2026-04-05 - Mac dev: SSH por chave para o Pi
- **Chave:** `~/.ssh/id_ed25519` (Ed25519, sem passphrase — só para dev; pode proteger com `-p` depois).
- **Pi:** chave pública em `authorized_keys` do utilizador `kim`; login testado com `BatchMode` (sem password).
- **Atalho:** `~/.ssh/config` com host **`pi-estoque`** → `ssh pi-estoque` (IP `192.168.1.159`).
- **Nota:** se o IP do Pi mudar na WLAN, ajustar `HostName` no `config` ou usar IP fixo no router.

### Sessão - 2026-04-05 - Pi: .env com Supabase + deploy do script de sync (SSH)
- **Pi (`kim@192.168.1.159`):** `~/pi-print-ws/.env` ganhou `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PI_TUNNEL_SYNC_SECRET` (alinhado ao banco); script `cloudflared-quick-tunnel-sync.sh` e unit `cloudflared-pi-print-ws.service` atualizados; `systemctl restart cloudflared-pi-print-ws`.
- **Supabase:** `ws_public_url` atualizado automaticamente para o novo host quick após reinício do túnel.
- **Script:** variáveis sensíveis deixam de ser exportadas antes do `cloudflared` (evita aparecerem no `journalctl` no mapa de env do túnel).
- **Validação:** `SELECT ws_public_url` coerente com o túnel ativo; logs sem eco de `PI_TUNNEL_SYNC_SECRET` após o fix.

### Sessão - 2026-04-05 - Supabase: sync automático da URL do túnel quick (Pi → RPC)
- **Migrações:** `20260405100000_sync_pi_tunnel_ws_url_rpc.sql` — coluna `tunnel_sync_secret`, função `sync_pi_tunnel_ws_url`; `20260405100001_config_impressao_pi_column_privileges_tunnel_secret.sql` — anon/authenticated só leem colunas públicas da tabela (sem expor `tunnel_sync_secret` na API).
- **Pi (repo):** `scripts/pi-print-ws/cloudflared-quick-tunnel-sync.sh` + unit `cloudflared-pi-print-ws.service` chama o script; `.env` com `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PI_TUNNEL_SYNC_SECRET`.
- **Doc:** `docs/IMPRESSAO_PI_ACESSO_REMOTO.md` (dois tipos de token); `docs/consultas-sql/config-impressao-pi.sql`; tipos `database.ts`.
- **Validação:** `npm run build` OK; migrações aplicadas no projeto via MCP.

### Sessão - 2026-04-04 - Pi: systemd `cloudflared-pi-print-ws` + `config_impressao_pi` com wss
- **Pi:** unit `cloudflared-pi-print-ws.service` instalada via `scp` + `sudo mv` (evita corrupção com heredoc/`sudo -S`); `cloudflared tunnel --url http://127.0.0.1:8765`, utilizador `kim`, `After=pi-print-ws.service`. Ficheiro versionado: `scripts/pi-print-ws/cloudflared-pi-print-ws.service`.
- **Supabase:** `UPDATE` em `config_impressao_pi` (id=1): `ws_public_url` = **wss://** do host quick tunnel atual, `ws_token` alinhado ao `PRINT_WS_TOKEN` do Pi, `cups_queue = ZebraZD220`.
- **Nota:** túnel **quick** (`trycloudflare.com`) pode trocar de hostname ao reiniciar o serviço — atualizar `ws_public_url` no banco ou migrar para túnel nomeado (Zero Trust).
- **Validação:** `systemctl` enable/start OK; `journalctl` com URL do túnel; `SELECT` confirma linha no Supabase (sem expor token).

### Sessão - 2026-04-04 - Supabase: migração `config_impressao_pi` aplicada (MCP)
- **MCP Supabase:** `apply_migration` com o SQL de `20260404140000_config_impressao_pi.sql`; tabela **`public.config_impressao_pi`** criada (1 linha default), RLS + policy `allow_all_config_impressao_pi`.
- **Cloudflare API (MCP):** tentativa de listar túneis retornou erro de autenticação no token da sessão — reautenticar MCP Cloudflare no Cursor se for necessário automatizar túneis pela API.
- **Validação:** `list_tables` confirma `config_impressao_pi` no projeto ligado ao MCP.

### Sessão - 2026-04-04 - Impressão Pi: URL no Supabase + acesso remoto (wss)
- **Motivo:** evitar `NEXT_PUBLIC_PI_PRINT_WS_URL` em cada PC; imprimir via Railway/HTTPS exige **wss://** (túnel no Raspberry).
- **Banco:** migração `20260404140000_config_impressao_pi.sql` — tabela `config_impressao_pi` (singleton id=1). `resolvePiPrintConnection()`: env primeiro, senão Supabase.
- **Front:** `usePiPrintBridgeConfig`, páginas Separar por Loja e teste de impressão atualizadas. Doc `docs/IMPRESSAO_PI_ACESSO_REMOTO.md` + `docs/consultas-sql/config-impressao-pi.sql`.
- **Tipos:** `config_impressao_pi` em `database.ts`.
- **Validação:** `npm run build` OK. **Deploy SQL:** aplicar migração no projeto Supabase em uso.

### Sessão - 2026-04-04 - Teste de impressão: botão Pi / Zebra
- **`/teste-impressao-etiqueta`:** mesmo fluxo WebSocket que Separar por Loja (`gerarDocumentoHtmlEtiquetas` + `enviarHtmlParaPiPrintBridge`), job name `teste-impressao-{formato}`; avisos se env Pi ausente ou HTTPS+ws.
- **Validação:** `npm run build` OK.

### Sessão - 2026-04-04 - Separar por Loja: impressão WebSocket → Pi (Zebra)
- **Front:** `gerarDocumentoHtmlEtiquetas` em `label-print.ts`; `pi-print-ws-client.ts` (`enviarHtmlParaPiPrintBridge`, `preferCssPageSize`). **Separar por Loja:** botão **Imprimir na estação (Pi / Zebra)**; pós-**Criar separação** com `NEXT_PUBLIC_PI_PRINT_WS_URL` tenta Pi e faz fallback para `imprimirEtiquetasEmJobUnico` se falhar.
- **Pi (repo):** `server.mjs` aceita `preferCssPageSize` no JSON para PDF multipágina via `@page` + `page-break`.
- **Doc:** `README.md` — variáveis `NEXT_PUBLIC_PI_PRINT_*`; `CONTEXTO_ATUAL.md` atualizado.
- **Validação:** `npm run build` OK.

### Sessão - 2026-04-04 - Raspberry Pi: Zebra ZD220 USB + CUPS
- **Hardware:** `lsusb` — Zebra ZTC ZD220-203dpi ZPL (`0a5f:0164`). **CUPS:** fila `ZebraZD220`, backend `usb://Zebra%20Technologies/ZTC%20ZD220-203dpi%20ZPL?serial=…`, modelo **Zebra ZPL Label Printer** (`drv:///sample.drv/zebra.ppd`, driver genérico do pacote CUPS; aviso de depreciação do `lpadmin -m` é esperado nas versões novas).
- **Padrões:** `PageSize=Custom.60x30mm`, `Resolution=203dpi`, `MediaType=Thermal Direct`; impressora padrão do sistema = `ZebraZD220`. Teste ZPL raw: job concluído com sucesso.
- **`pi-print-ws`:** `CUPS_QUEUE=ZebraZD220` no `~/pi-print-ws/.env`; serviço reiniciado.

### Sessão - 2026-04-04 - Raspberry Pi: ponte WebSocket para impressão (CUPS)
- **SSH** em `kim@192.168.1.159` (Raspbian trixie): `nodejs`/`npm` via apt; projeto `~/pi-print-ws` com `ws` + `puppeteer-core` (Chromium `/usr/bin/chromium`); serviço **systemd** `pi-print-ws.service` (boot). Health HTTP `http://IP:8765/health`. Payload JSON: `{ type: \"print\", html, widthMm?, heightMm?, jobName?, queue? }`.
- **CUPS:** `kim` adicionado a `lpadmin`; **nenhuma fila** no momento do teste — `lp` retorna até cadastrar impressora. Smoke test local no Pi: WebSocket + PDF OK, `lp` falhou só por falta de destino padrão.
- **Repo:** `scripts/pi-print-ws/` (`server.mjs`, `package.json`, `pi-print-ws.service`).
- **Validação:** `npm run build` no estoque-app OK.

### Sessão - 2026-04-02 - Estoque: primeira carga operadora sem vazar consolidado
- **Problema:** na abertura de **Estoque** como `OPERATOR_STORE`, o primeiro fetch às vezes ia com `usuario === null` (antes do effect do `useAuth`), `p_local_id` nulo na RPC e lista “de todos os locais”; ao mudar o filtro de estado e voltar, uma nova busca com loja correta mostrava só o estoque real da loja.
- **Correção:** `usuarioEscopo = usuario ?? getUsuarioLogado()` para derivar `localIdEfetivo` / perfil; contador de geração em `carregarResumoEstoque` e `carregarResumoMinimo` para não aplicar resposta antiga por cima da atual.
- **Validação:** `npm run build` OK.

### Sessão - 2026-04-02 - MCP Supabase alinhado ao .env (um banco)
- **Esclarecimento:** o app sempre usou um Postgres; o MCP é cliente do mesmo projeto. Wrapper `~/.cursor/supabase-mcp-wrapper.sh` passou a ler `SUPABASE_MCP_PROJECT_REF` / `ESTOQUE_APP_ENV_PATH` de `~/.cursor/supabase-mcp.env`.
- **Repo:** `npm run sync:mcp-supabase` (`scripts/sync-cursor-mcp-supabase.mjs`) atualiza esse `.env` a partir do `.env.local` do estoque-app. Doc `docs/SUPABASE_AMBIENTE_E_MCP.md` reescrita.
- **Validação:** `npm run sync:mcp-supabase` OK; `npm run build` OK.

### Sessão - 2026-04-02 - Supabase: doc MCP vs .env + script ref + SQL estoque loja
- **Motivo:** cruzamento MCP × localhost falhou (projetos diferentes); operação precisa validar estoque no banco certo.
- **Inclusões:** `docs/SUPABASE_AMBIENTE_E_MCP.md`; `docs/consultas-sql/estoque-por-loja.sql`; `scripts/show-supabase-project-ref.mjs`; script npm `env:supabase-ref`; trechos em `docs/FLUXO_ENTREGA.md` e `AGENTS.md`.
- **Validação:** `npm run env:supabase-ref` (com `.env.local`); `npm run build` OK.

### Sessão - 2026-04-02 - Estoque: funcionário de loja só vê a própria unidade
- **Estoque** (`OPERATOR_STORE`): `localIdEfetivo` ignora `filtroLocal`; sem `local_padrao_id` não chama RPC (evita `p_local_id` nulo = todos os locais). Seletor “Todos os locais” oculto para operadora. Texto de ajuda e aviso sem loja cadastrada reforçados. Comentário em `idLocalLojaOperadora`.
- **Validação:** `npm run build` OK.

### Sessão - 2026-04-02 - Separar por Loja: impressão alinhada à transferência + aviso pré-separação
- **Problema tratado:** QR válido no banco mas recusado no recebimento quando a etiqueta não correspondia aos `item_id` da transferência (impressão/lista divergindo da «Criar separação»).
- **Mudanças:** após **Criar separação** (viagem + transferência), `confirm` de impressão e janela de etiquetas com **snapshot** dos itens e lote `SEP-{viagem}`; helper `montarEtiquetasSeparacaoParaImpressao`; **Guia PDF** e **Só imprimir** com `confirm` de risco antes; textos de ajuda e sucesso atualizados. **Recebimento:** mensagem de erro mais explícita quando o item não está na transferência.
- **Validação:** `npm run build` OK.

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
