# Fluxo de entrega (manter sempre)

Documento canônico para **não quebrar** o caminho: código → validação → deploy → banco → contexto.

## 1. Desenvolvimento local

- `.env.local` com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (e `SUPABASE_SERVICE_ROLE_KEY` se precisar).
- Node alinhado ao projeto: use **Node 20** (arquivo `.nvmrc` na raiz).
- Antes de subir alteração relevante:

```bash
npm ci   # ou npm install
npm run build
```

Se o build falhar, **não** faça merge/push para `main`.

## 2. Repositório Git (fonte da verdade)

- Trabalho integrado em **`main`** (ou PR → revisão → merge em `main`).
- Após push em `main`, o **GitHub Actions** roda `CI` (`npm ci` + `npm run build`). Deploy só faz sentido com **CI verde**.

## 3. Deploy do app (Railway)

- Hospedagem do Next.js: **Railway** (ver `README.md`).
- Opções comuns:
  - **Git conectado:** push em `main` dispara build/deploy no serviço Railway (configurar no dashboard).
  - **CLI:** `railway up` a partir do repositório (como registrado em `LOG_SESSOES.md`).
- Variáveis de ambiente de produção no Railway devem espelhar o necessário para o app (Supabase URL/anon key, etc.).

## 4. Banco Supabase (sempre que o schema mudar)

- **Mesmo projeto em todo lugar:** um único Postgres por ambiente (`NEXT_PUBLIC_SUPABASE_URL`). Para o MCP do Cursor usar o mesmo ref que este repo: `npm run sync:mcp-supabase` e reiniciar o MCP; detalhes em `docs/SUPABASE_AMBIENTE_E_MCP.md`. Conferir ref: `npm run env:supabase-ref`.
- Migrations versionadas em `supabase/migrations/`.
- **Produção:** aplicar no projeto Supabase de produção **na ordem** (SQL Editor ou CLI Supabase), **antes** ou junto com o deploy que depende do novo schema.
- Manter `supabase/schema_public.sql` alinhado quando fizer sentido para o time (espelho legível do estado alvo).

## 5. Documentação operacional do projeto

Quando houver mudança relevante de fluxo, permissões, estoque ou decisão de produto:

- Atualizar **`CONTEXTO_ATUAL.md`** (estado vigente).
- Registrar em **`LOG_SESSOES.md`** (o que mudou, impacto, validação).

Regra detalhada: `.cursor/rules/contexto-operacional.mdc` e `AGENTS.md`.

## 6. O que o CI **não** cobre ainda

- **`npm run lint`** hoje acusa muitos avisos/erros legados; o gate oficial é **`npm run build`** (inclui checagem TypeScript do Next).
- Testes E2E / RLS em produção: evoluir conforme prioridade.

## Checklist rápido antes de considerar “pronto”

- [ ] `npm run build` OK localmente  
- [ ] Push/PR com CI verde  
- [ ] Migrations aplicadas no Supabase **de produção** se o diff tocar schema  
- [ ] `CONTEXTO_ATUAL.md` / `LOG_SESSOES.md` se for mudança operacional relevante  
