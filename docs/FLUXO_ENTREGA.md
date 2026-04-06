# Fluxo de entrega (manter sempre)

Documento canônico para **não quebrar** o caminho: código → validação → deploy → banco → contexto.

## 1. Desenvolvimento local

- `.env.local` com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (e `SUPABASE_SERVICE_ROLE_KEY` se precisar).
- Node alinhado ao projeto: use **Node 20** (arquivo `.nvmrc` na raiz).
- Antes de subir alteração relevante:

```bash
npm ci   # ou npm install
npm run lint
npm run build
```

Se o lint ou o build falhar, **não** faça merge/push para `main`.

## 2. Repositório Git (fonte da verdade)

- Trabalho integrado em **`main`** (ou PR → revisão → merge em `main`).
- Após push em `main`, o **GitHub Actions** roda `CI` (`npm ci` + `npm run lint` + `npm run build`). Deploy só faz sentido com **CI verde**.

## 3. Deploy do app (Railway)

- Hospedagem do Next.js: **Railway** (ver `README.md`).
- **Build:** **Railpack** (detecção automática de Node/Next pelo Railway). **Sem** `Dockerfile` / `railway.json` na raiz — builds Docker ficaram **presos em INITIALIZING** e competiam com fila/manutenção no plano hobby; Railpack é o caminho **estável** comprovado (`npm run build` + `npm run start` no serviço).
- **Variáveis:** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no serviço (**Build** e **Runtime**).
- **Gatilho:** push em `main` com repo ligado ao serviço. **Evite** `railway up` logo após o push (dois builds em fila).
- **CLI (um único deploy + acompanhamento):** `npm run railway:release` → `railway up --detach` e em seguida `scripts/railway-wait-deployment.mjs` (timeout via `RAILWAY_WAIT_TIMEOUT_SEC`, padrão 900). Só listar status: `railway deployment list --json`.
- **Cancelar fila duplicada (vários `QUEUED`):** crie um token em [railway.com/account/tokens](https://railway.com/account/tokens), exporte `RAILWAY_TOKEN`, confira com `npm run railway:prune-queued -- --dry-run`, depois `npm run railway:prune-queued` — usa a API `deploymentCancel` e mantém só o deploy **QUEUED** mais recente. O painel também permite “Abort” por deploy; `railway down` **não** cancela `QUEUED`.

### Por que o deploy “demora”

- Cada deploy roda de novo **instalação de dependências** + **`next build`** no servidor (costumo ver **~3–10 min**, conforme fila do Railway e cache).
- O **GitHub Actions** (CI) também faz `npm ci` + build em paralelo no GitHub — isso **não** substitui o build do Railway; são dois processos independentes após o `push`.
- **Evite disparar dois deploys seguidos** no mesmo serviço: não faça `git push` e logo em seguida `railway up` sem necessidade — são **dois builds** em fila e a sensação é de atraso dobrado.
- Mensagens **“queued due to maintenance”** ou **“system backpressure”** vêm da **plataforma** Railway; não dá para limpar só pelo repositório — espere ou ajuste no painel.

### Deploy não termina / fica em fila

1. Rode **`npm run railway:diagnose`** (ou `railway deployment list --json`) e confira status.
2. **Vários `QUEUED` por excesso de pushes:** `RAILWAY_TOKEN=… npm run railway:prune-queued -- --dry-run` e, se a lista fizer sentido, sem `--dry-run` (mantém 1 deploy na fila; opcional `--keep 2`).
3. **Vários `DEPLOYING` / `INITIALIZING` ao mesmo tempo** (por exemplo, builds **Docker** antigos ainda rodando depois de remover `Dockerfile` do Git): abra o projeto com **`railway open`** → serviço → **Deployments** → **cancele** os deploys presos ou obsoletos. A CLI **não** cancela fila; `railway down` remove o **último deploy com sucesso**, não serve para abortar um build preso.
4. **`QUEUED` + “maintenance”**: fila da Railway — só esperar ou acompanhar [status](https://status.railway.com/). Reduzir `QUEUED` duplicados ajuda (`railway:prune-queued`), mas **manutenção** só some quando a plataforma normalizar.
5. Para ver onde parou: **`railway logs --build -n 120 <id>`** e **`railway logs --deployment -n 120 <id>`** (o `<id>` vem da lista JSON).
6. **ACTIVE via CLI** e **QUEUED via GitHub** ao mesmo tempo: o serviço pode estar **online** com o último `railway up`, enquanto builds disparados pelo **Git** esperam manutenção/fila — não indica que o app caiu; alinhar qual commit está em produção pelo card do deploy **ACTIVE**.

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

- Testes E2E / RLS em produção: evoluir conforme prioridade.

## Checklist rápido antes de considerar “pronto”

- [ ] `npm run lint` e `npm run build` OK localmente  
- [ ] Push/PR com CI verde  
- [ ] Migrations aplicadas no Supabase **de produção** se o diff tocar schema  
- [ ] `CONTEXTO_ATUAL.md` / `LOG_SESSOES.md` se for mudança operacional relevante  
