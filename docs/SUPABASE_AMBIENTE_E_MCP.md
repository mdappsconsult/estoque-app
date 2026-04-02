# Supabase: um banco só (app + Cursor MCP)

## Não são dois bancos

O **Next.js** (localhost e Railway) usa **um** Postgres: o projeto em `NEXT_PUBLIC_SUPABASE_URL` (`.env.local`).

O **MCP Supabase no Cursor** é só um **cliente** que consulta esse mesmo projeto. Antes o ref do projeto estava **fixo** no script do wrapper; agora ele vem de `~/.cursor/supabase-mcp.env`, alinhado ao `.env.local` do repositório.

Se em algum momento o MCP parecer “diferente” da tela, costuma ser **token/projeto errado no MCP**, **RLS** na sessão do app vs role do MCP, ou **dados que mudaram** — não um “segundo banco” do app.

## Manter MCP alinhado ao app (terminal)

Na pasta do repositório:

```bash
npm run sync:mcp-supabase
```

Isso grava em `~/.cursor/supabase-mcp.env`:

- `ESTOQUE_APP_ENV_PATH` — caminho absoluto do `.env.local` deste repo  
- `SUPABASE_MCP_PROJECT_REF` — mesmo ref da URL do Supabase do app  

Depois **reinicie o MCP** no Cursor (Command Palette → **MCP: Restart**) ou feche e abra o Cursor.

O wrapper `~/.cursor/supabase-mcp-wrapper.sh` usa essas variáveis (e, se `SUPABASE_MCP_PROJECT_REF` estiver vazio, extrai o ref de `ESTOQUE_APP_ENV_PATH`).

## Conferir qual ref o app usa

```bash
npm run env:supabase-ref
```

## Cruzar estoque com a tela

Use `docs/consultas-sql/estoque-por-loja.sql` no **SQL Editor do mesmo projeto** (mesmo ref que `env:supabase-ref`).
