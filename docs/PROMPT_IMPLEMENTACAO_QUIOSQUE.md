# Prompt de implementação — Módulo Quiosque (ler antes de codar ou criar banco)

Use este arquivo como **especificação única** para implementação (humano ou assistente). Não começar migrations nem rotas sem alinhar com as seções abaixo. Plano de alto nível: [`.cursor/plans/quiosque_next_subdomain_a1ed182d.plan.md`](../.cursor/plans/quiosque_next_subdomain_a1ed182d.plan.md) (se existir na máquina) ou cópia interna do time.

---

## 1. Missão e escopo

**Objetivo:** Permitir venda self-service de açaí no freezer via celular: cliente acessa vitrine, monta pedido com complementos, paga **PIX (Mercado Pago)**. A matriz configura tudo em **controle.acaidokim.com.br → Configurações → Quiosque**. A vitrine pública fica em **quiosque.acaidokim.com.br**.

**Fora do escopo do primeiro ciclo (a menos que explicitamente reaberto):**

- Nota fiscal automática / SAT / NFC-e.
- Conta Mercado Pago por dono de freezer (MVP = **uma conta empresa**).
- “Vender por kg” e perfis fiscais por item (campos podem existir como placeholder desligado).
- Disponibilidade por faixa de horário (MVP = **sempre disponível**).
- Baixa automática de `itens` (QR) do ERP no ato da venda (MVP = **estoque do freezer por contagem/snapshot** no quiosque).

---

## 2. Domínios e roteamento

| Host | Comportamento |
|------|----------------|
| `quiosque.acaidokim.com.br` | Apenas experiência **pública** de compra (e opcionalmente dono/operador com login leve). **Sem** `AuthGuard` operacional. |
| `controle.acaidokim.com.br` | App **operacional** atual (login bcrypt, perfis) + **Configurações → Quiosque** com todo CRUD. |
| Domínio legado / Railway | Mesmo fluxo que `controle` (middleware não deve quebrar deploy atual). |

**Implementação:** `middleware.ts` inspeciona `Host`, reescreve para route groups: `(quiosque)` vs `(operacional)`. **Refatorar** [src/app/layout.tsx](src/app/layout.tsx): hoje `AuthGuard` envolve tudo; migrar páginas existentes para `src/app/(operacional)/...` e criar `src/app/(quiosque)/...` com layout próprio.

**URLs públicas sugeridas:**

- `GET /f/[slug]` — Home do freezer (`slug` único em `quiosques`).
- `GET /f/[slug]/p/[itemId]` — Página do produto (item do cardápio).
- `GET /f/[slug]/carrinho` — Carrinho.
- `GET /f/[slug]/pagamento` — Checkout PIX.
- `GET /f/[slug]/pedido/[pedidoId]` — Status / comprovante.

QR físico: `https://quiosque.acaidokim.com.br/f/{slug}` (e variantes para produto se desejado).

---

## 3. Identidade e UI

**Marca:** Açaí do Kim — usar [LogoKim](src/components/branding/LogoKim.tsx) e `/branding/acai-do-kim-logo.png` na vitrine e cabeçalhos adequados. **Não** exibir marcas de plataformas terceiras usadas só como referência visual interna.

**Referências de layout (admin cardápio):** prints em `docs/referencias-ui-quiosque/` (copiar para o repo se ainda estiverem só na pasta `assets` do Cursor). Padrão: **dark mode**, fundo ~`#212121`–`#262626`, cards um tom acima, texto claro, **azul** ~`#007bff` (ou token) para primário, acento laranja opcional para estados “selecionado” / árvore de complementos.

**Admin (Config → Quiosque):** denso, tabelas/cards arrastáveis ou setas de ordem, badges “Disponível”, busca, ações “Ver no app”.

**Vitrine (quiosque):** mobile-first, acessível (contraste, área de toque ≥ 44px), estados vazio / erro / carregando; pode ser tema claro ou dark — definir um tema coerente com a marca Kim.

---

## 4. Quem acessa o quê (permissões)

- **Config → Quiosque (CRUD):** `ADMIN_MASTER`, `MANAGER`. Registrar rotas em [src/lib/permissions.ts](src/lib/permissions.ts) e em `ROUTE_UI_META` para a matriz de permissões em [src/app/configuracoes/permissoes](src/app/configuracoes/permissoes) (se aplicável).
- **Leitura pública do cardápio:** sem login; dados limitados por `slug` do freezer.
- **APIs sensíveis (criar pagamento, webhook MP, admin writes):** apenas servidor com `SUPABASE_SERVICE_ROLE_KEY`; validar origem e payloads.

---

## 5. Modelo de negócio: freezer e loja

Cada registro em `quiosques` deve ter **`local_id` NOT NULL** referenciando [locais](supabase/) já usados no estoque (ex.: “Barra”). Relatórios e filtros usam essa ligação (“vendas do quiosque da Loja X”).

Campos conceituais do freezer: `slug` (único), `nome_exibicao`, `ativo`, `percentual_dono` (repasse contábil na UI), limites de alerta de reposição, opcional metadados de impressão.

---

## 6. Cardápio (dados que alimentam a home do quiosque)

### 6.1 Hierarquia

1. **Categoria** — nome, ordem, ativa, pertence a um `quiosque_id` (MVP: cardápio **por freezer**).
2. **Item do cardápio (produto na vitrine)** — nome, descrições, preço base, imagem, ordem na categoria, código interno opcional, `produto_id` opcional (ligação ao ERP), flag destaque, disponibilidade MVP sempre on.
3. **Grupo de complemento** — vinculado ao item; título, descrição opcional, ordem, `selecao_min`, `selecao_max` (equivalente a obrigatório: min ≥ 1).
4. **Opção do grupo** — nome, preço adicional, ordem, ativo.

### 6.2 Comportamento na vitrine

- Cliente escolhe obrigatoriamente dentro dos limites de cada grupo antes de adicionar ao carrinho (validar no cliente e **revalidar no servidor** ao fechar pedido).
- Preço final = preço base + soma dos adicionais das opções escolhidas (snapshot no pedido).

### 6.3 Importação

- Ação “Importar produto”: opcionalmente pré-preencher a partir de `produtos` (nome, imagem se houver); preço e complementos continuam sendo do cardápio quiosque.

---

## 7. Telas admin (`controle` — Configurações → Quiosque)

**Rota base:** `/configuracoes/quiosque`. Item no [Sidebar](src/components/layout/Sidebar.tsx) sob Configurações: label **«Quiosque»**.

### Abas principais

1. **Pontos** — CRUD freezers: loja (`local_id`), slug, nome, ativo, % dono, alertas, link “Abrir vitrine”.
2. **Cardápio** — Lista de categorias (como refs): adicionar/reordenar/buscar; dentro de cada categoria, lista de produtos com foto, preço, status; “+ Produto”; “Ver no app” (abre `https://quiosque.acaidokim.com.br/f/{slug}` em nova aba).
3. **Pagamentos** — PIX via MP: instruções de webhook, modo sandbox/prod, variáveis de ambiente (sem commitar segredos).
4. **Pedidos** — Lista por período/freezer (read-only para matriz).

### Editor de produto (página ou modal)

Sub-abas alinhadas às referências:

| Aba | Campos / ações |
|-----|----------------|
| **Detalhes** | Categoria, nome, descrição curta/longa, preço (BRL), upload imagem (Storage), código interno, integração opcional `produto_id`, ordem. |
| **Complementos** | Toggle “tem grupos”; CRUD grupos (min/max, título, descrição); CRUD opções com preço; reordenar; “+ Criar grupo”; ideal “Copiar grupos de outro item” cedo. |
| **Classificação** | MVP: destaque + tags simples opcionais. |
| **Disponibilidade** | MVP: somente “sempre disponível”. |

Ações: **Salvar** / **Cancelar**; feedback de erro claro; confirmação em ações destrutivas.

---

## 8. Telas públicas (`quiosque` host)

- **Home `/f/[slug]`:** categorias e itens ativos daquele freezer; imagens otimizadas (next/image); link para carrinho.
- **PDP:** grupos e opções conforme admin; botão adicionar.
- **Carrinho:** revisão, alterar quantidades, ir para pagamento.
- **Pagamento:** criar intenção PIX no backend; exibir QR e copia-e-cola; polling ou retorno de status; mensagens de erro amigáveis.
- **Pós-compra:** página de pedido com status (pago / pendente / expirado).

---

## 9. Pagamentos (Mercado Pago)

- **MVP:** `MERCADOPAGO_ACCESS_TOKEN` (e variáveis auxiliares) no **Railway** / `.env.local`; criar pagamento PIX via API server-side; **webhook** HTTPS público validando assinatura quando MP suportar; atualizar `quiosque_pedidos.status`.
- **Idempotência:** mesmo callback não pode duplicar efeitos colaterais.
- **Segredo:** nunca expor access token ao browser.

---

## 10. Banco de dados (Supabase) — checklist antes de aplicar SQL

- [ ] Tabelas: `quiosques`, `quiosque_categorias`, `quiosque_itens`, `quiosque_grupos_complemento`, `quiosque_grupo_opcoes`, `quiosque_pedidos`, `quiosque_pedido_linhas` (ou nomes equivalentes documentados na migration).
- [ ] FKs: `quiosques.local_id` → `locais.id`; integridade em cascata conforme política (preferir soft-delete com `ativo`).
- [ ] Índices: `quiosques.slug` único; `(quiosque_id, ordem)` em categorias/itens; `(item_id)` em grupos.
- [ ] **RLS:** políticas explícitas — anon: leitura controlada do catálogo por slug; sem insert direto em tabelas sensíveis pelo anon; pedidos via RPC restrita ou route handler.
- [ ] **Storage:** bucket privado/público conforme decisão para imagens (`quiosque-cardapio` ou similar); policy de upload só usuários autenticados operacionais ou só via API com service role.
- [ ] Migração versionada em `supabase/migrations/` com timestamp; alinhar `schema_public.sql` se o projeto mantiver espelho.

---

## 11. APIs e segurança

- Rotas `src/app/api/quiosque/...` ou `api/mercadopago/...`: validar método, body, freezer existente e ativo.
- Webhook MP: path estável documentado em `docs/` para cadastro no painel MP.
- Rate limit básico em criação de pagamento (considerar middleware ou checagem simples).

---

## 12. Entrega e qualidade

- Antes de merge em `main`: `npm run lint` e `npm run build` (CI do GitHub igual).
- Após feature relevante: atualizar [CONTEXTO_ATUAL.md](CONTEXTO_ATUAL.md) e [LOG_SESSOES.md](LOG_SESSOES.md) (regra do projeto).
- Variáveis novas documentadas (README ou doc de deploy).

---

## 13. Ordem sugerida de implementação

1. Route groups + middleware + hosts (sem quebrar rotas atuais).
2. Migrations + RLS + bucket imagens.
3. Admin Config → Quiosque (abas + cardápio + editor produto).
4. API leitura catálogo público + páginas vitrine.
5. Carrinho + MP PIX + webhook + pedidos.
6. Dono / operação / alertas / etiquetas (fases seguintes).

---

## 14. Prompt curto para colar em sessão de código (copiar bloco abaixo)

```
Implementar módulo Quiosque no monorepo estoque-app (Next.js App Router + Tailwind + Supabase).

Restrições:
- Não quebrar app operacional existente: refatorar layout para (operacional) com AuthGuard e (quiosque) sem AuthGuard; middleware por Host quiosque vs controle.
- Domínios: quiosque.acaidokim.com.br = vitrine; controle.acaidokim.com.br = admin em Configurações → Quiosque.
- Marca Açaí do Kim apenas; specs UI admin em docs/PROMPT_IMPLEMENTACAO_QUIOSQUE.md e refs em docs/referencias-ui-quiosque/.
- MVP: cardápio por freezer (quiosque_id); cada freezer obrigatório local_id → locais; PIX uma conta MP servidor-only; sem NF-e; disponibilidade sempre on.
- Banco: tabelas quiosques, categorias, itens, grupos_complemento, grupo_opcoes, pedidos + linhas com snapshot; RLS seguro; migrations em supabase/migrations/.
- Admin: /configuracoes/quiosque com abas Pontos | Cardápio | Pagamentos | Pedidos; editor produto com Detalhes | Complementos | Classificação | Disponibilidade (última só sempre disponível no MVP).
- Público: /f/[slug]/... carrinho e pagamento MP; validar complementos no servidor ao pagar.
Seguir lint/build e atualizar CONTEXTO_ATUAL.md e LOG_SESSOES.md ao finalizar.
```

---

*Documento gerado para alinhamento pré-código. Ajustar datas e nomes de tabelas na migration final conforme revisão do time.*
