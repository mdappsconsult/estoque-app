# Contexto para novo agente — Registrar compra por foto da nota (NF)

Documento de **handoff** resumindo decisões, implementação e pendências desta linha de trabalho. O estado operacional canônico do produto continua em **`CONTEXTO_ATUAL.md`**; o histórico de sessões em **`LOG_SESSOES.md`**.

---

## Objetivo de negócio

- Operador da **indústria/estoque** fotografa a **DANFE/nota**, o sistema **valida qualidade da imagem**, **extrai dados (OCR/visão)**, casa com **produtos cadastrados** (EAN `codigo_barras` + nome), permite **cadastro rápido** de itens faltantes, mostra **pré-resumo** e com **um OK** grava vários **`lotes_compra`** (mesma NF/fornecedor/local).

---

## Rotas e fluxo técnico

| Peça | Caminho / observação |
|------|----------------------|
| Tela | [`src/app/entrada-compra-nota/page.tsx`](src/app/entrada-compra-nota/page.tsx) — foto → qualidade → senha operacional → extrair → conferência → resumo → `criarLoteCompra` por linha |
| API | [`POST /api/operacional/extrair-nota-compra`](src/app/api/operacional/extrair-nota-compra/route.ts) — valida login/senha operacional (mesmo padrão de outras rotas operacionais), upload Storage, chama OCR, auditoria `EXTRAIR_NOTA_COMPRA_IMAGEM` |
| OCR | [`src/lib/nota-compra/ocr-extrair.ts`](src/lib/nota-compra/ocr-extrair.ts) |
| Qualidade (cliente) | [`src/lib/nota-compra/qualidade-imagem.ts`](src/lib/nota-compra/qualidade-imagem.ts) |
| Match produto | [`src/lib/nota-compra/match-produto.ts`](src/lib/nota-compra/match-produto.ts) |
| Lançamento | [`src/lib/services/lotes-compra.ts`](src/lib/services/lotes-compra.ts) — `criarLoteCompra` (igual entrada manual) |

**Autenticação na API:** `login` + `senha` no body; usuário precisa de **`login_operacional`** cadastrado.

---

## Provedores de OCR (visão)

Ordem em modo **`auto`** (padrão):

1. Se existir **`ANTHROPIC_API_KEY`** → **Claude** (Anthropic Messages API, imagem base64).
2. Senão, se existir **`OPENAI_API_KEY`** → **OpenAI** (`gpt-4o-mini` por padrão, override `OPENAI_NOTA_COMPRA_MODEL`).

Variáveis úteis:

| Variável | Função |
|----------|--------|
| `NOTA_COMPRA_OCR_MODE=mock` | Dados de demonstração; **não** chama APIs (teste de UI) |
| `NOTA_COMPRA_OCR_PROVIDER` | `auto` \| `anthropic` \| `openai` — força provedor |
| `ANTHROPIC_API_KEY` | Chave API Anthropic (**console.anthropic.com**, não é o plano “Claude Pro” do chat) |
| `ANTHROPIC_NOTA_COMPRA_MODEL` | Opcional; padrão no código: `claude-sonnet-4-6` (IDs antigos ex.: `claude-3-5-sonnet-20241022` podem retornar 404 na API) |
| `OPENAI_API_KEY` / `OPENAI_NOTA_COMPRA_MODEL` | Alternativa OpenAI |

**Erros vistos na prática:**

- OpenAI **429 insufficient_quota** — falta billing/cota na conta OpenAI.
- Anthropic **400 credit balance too low** — falta **crédito na API** em Plans & Billing do console Anthropic (independente do plano de chat).

---

## Banco e Storage (Supabase)

| Item | Migração / arquivo |
|------|---------------------|
| Coluna `produtos.codigo_barras` | [`supabase/migrations/20260421180000_produtos_codigo_barras.sql`](supabase/migrations/20260421180000_produtos_codigo_barras.sql) |
| Bucket privado `notas-compra` | [`supabase/migrations/20260421190000_storage_notas_compra.sql`](supabase/migrations/20260421190000_storage_notas_compra.sql) — insert mínimo (`id`, `name`, `public`) por compatibilidade |
| SQL manual (painel) | [`docs/consultas-sql/storage-bucket-notas-compra.sql`](docs/consultas-sql/storage-bucket-notas-compra.sql) |

Upload da imagem é feito no servidor com **service role**; se o bucket não existir, a API devolve erro com campo **`detalhe`** (mensagem do Storage).

---

## Cadastro de produto

- Campo **Código de barras (EAN)** em [`src/components/produtos/ProdutoModal.tsx`](src/components/produtos/ProdutoModal.tsx) e persistência em [`src/app/cadastros/produtos/page.tsx`](src/app/cadastros/produtos/page.tsx).
- Na tela da nota, **cadastro rápido** cria produto e inclui na lista mesmo quando o filtro “receita indústria” não listaria o item ainda (`produtosOpcoesLinha`).

---

## Permissões e navegação

- Rota **`/entrada-compra-nota`** em [`src/lib/permissions.ts`](src/lib/permissions.ts) — mesmos perfis que `/entrada-compra` (Admin, Gerente, indústria).
- Menu: [`src/components/layout/Sidebar.tsx`](src/components/layout/Sidebar.tsx) — “Compra (foto NF)”.
- Home: [`src/app/page.tsx`](src/app/page.tsx) — card “Compra (foto da nota)”.

---

## CI / entrega

- Antes de merge em `main`: **`npm run lint`** e **`npm run build`** (ver [`docs/FLUXO_ENTREGA.md`](docs/FLUXO_ENTREGA.md)).
- Variáveis sensíveis só em **`.env.local`** (local) e **Railway Variables** (produção); nunca commitar chaves.

---

## Pendências / próximos passos (sugestão)

1. **Billing:** garantir crédito **Anthropic API** e/ou **OpenAI** conforme provedor escolhido.
2. **Railway:** replicar `ANTHROPIC_API_KEY` (e demais vars) no serviço de produção.
3. **Qualidade OCR:** ajustar prompts/thresholds de imagem conforme fotos reais de chão de fábrica.
4. **Roadmap** (não implementado): XML NF-e, fila assíncrona, OCR 100% on-prem.

---

## Como usar este arquivo num novo agente

Cole no início do chat algo como:

> Leia `docs/CONTEXTO_AGENTE_REGISTRO_COMPRA_FOTO_NF.md` e `CONTEXTO_ATUAL.md`. Continue a partir daí.

Isso evita repetir toda a conversa e mantém alinhamento com o repositório.
