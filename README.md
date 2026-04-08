# Controle de Estoque - QR Unitario

PWA de controle de estoque por unidade, com rastreio por QR do inicio ao fim.

## Mapa de documentacao

- `README.md`: onboarding tecnico e visao geral
- `docs/FLUXO_ENTREGA.md`: **fluxo oficial** código → CI → Railway → Supabase → contexto (manter sempre)
- `docs/IMPRESSAO_TERMICA_ZEBRA.md`: impressão **60×30** em impressora térmica (Zebra, margens, calibração)
- `DIAGRAMA_RAIZ_SISTEMA.md`: raiz logica e diagramas do sistema
- `APP_LOGICA.md`: especificacao funcional de negocio
- `SISTEMA_ESTRUTURA.md`: estrutura de evolucao do sistema sem perder relevancia
- `SPRINT_1.md`: execucao e status da sprint atual

## Objetivo do projeto

Este sistema controla ciclo completo de itens unitarios:

- entrada por compra ou producao
- separacao, transferencia e recebimento
- baixa diaria por consumo real
- perdas e divergencias
- auditoria de todas as acoes

O foco e operacao rapida no dia a dia, com telas simples para uso em celular.

## Stack atual

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Supabase (Postgres + Realtime)
- Scanner QR: `html5-qrcode`

## Deploy (produção)

- App Next.js: **Railway** — build **Railpack** (Node/Next automático). Push na `main` com repositório ligado ao serviço. Variáveis **`NEXT_PUBLIC_SUPABASE_URL`** e **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** no **build** e no runtime; **`SUPABASE_SERVICE_ROLE_KEY`** no runtime (mesmo valor do `.env.local`; sem ela o login em produção falha). Deploy manual com espera: **`npm run railway:release`** (CLI `railway` no PATH e projeto linkado). Fila com vários **`QUEUED`**: **Project token** do projeto (Railway → Settings → Tokens) como **`RAILWAY_PROJECT_TOKEN`**, ou token de conta em [railway.com/account/tokens](https://railway.com/account/tokens) como **`RAILWAY_TOKEN`** — **`npm run railway:prune-queued -- --dry-run`** (depois sem `--dry-run`). Não partilhes o token; se vazar, revoga e gera outro. Diagnóstico: **`npm run railway:diagnose`**; detalhes em **`docs/FLUXO_ENTREGA.md`**.
- Dados: **Supabase** (aplicar migrations em `supabase/migrations/` no projeto de produção quando o schema mudar).
- **Login operacional:** o app usa só a rota `POST /api/auth/operacional` com **`SUPABASE_SERVICE_ROLE_KEY`** no servidor (Railway e `.env.local`). Sem essa variável, o login falha. Credenciais ficam **apenas** no Supabase: `usuarios.login_operacional` + hash **bcrypt** em `credenciais_login_operacional` (definidas em **Cadastros → Usuários** por `ADMIN_MASTER`, ou carga inicial com `npm run seed:operacional` e `scripts/operacional-seed.local.json` — arquivo local, fora do Git; modelo em `scripts/operacional-seed.example.json`).

## Fluxo contínuo (resumo)

1. **`npm run lint`** e **`npm run build`** locais antes de integrar em `main`.
2. **GitHub Actions** (`CI`) em todo push/PR para `main` — precisa ficar **verde**.
3. **Railway** faz o deploy a partir do Git (recomendado ligar o repo no dashboard) ou via `railway up`.
4. **Migrations** no Supabase de produção quando o schema mudar.
5. **`CONTEXTO_ATUAL.md` / `LOG_SESSOES.md`** em mudanças operacionais relevantes.

Detalhes e checklist: **`docs/FLUXO_ENTREGA.md`**.

## Regras de negocio (resumo)

Perfis:

- `ADMIN_MASTER`
- `MANAGER`
- `OPERATOR_WAREHOUSE`
- `OPERATOR_STORE`
- `DRIVER`

Estados do item:

- `EM_ESTOQUE`
- `EM_TRANSFERENCIA`
- `BAIXADO`
- `DESCARTADO`

Regras principais:

- cada item fisico possui QR unico (na compra, o lote entra sem QR; os QR sao emitidos na separacao para a loja ou no consumo na producao)
- transferencia exige aceite antes do despacho
- recebimento compara enviado x recebido e gera divergencias
- baixa diaria so pode ocorrer no local do usuario
- descarte exige motivo
- auditoria registra usuario, local, acao, item e contexto

Para a especificacao funcional completa, leia `APP_LOGICA.md`.

## Fluxos implementados (telas)

- Login por telefone
- Entrada de compra
- Producao
- Separar por loja
- Viagem / aceite
- Receber entrega
- Transferencia loja -> loja
- Aceites pendentes
- Baixa diaria
- Perdas
- Contagem
- Estoque
- Validades
- Divergencias
- Rastreio por QR
- Dashboard admin
- Relatorios
- Cadastros de produtos, locais e usuarios

## Estrutura principal

- `src/app`: paginas e fluxos
- `src/lib/services`: regras e operacoes de dominio
- `src/hooks`: hooks de auth e realtime
- `src/types/database.ts`: tipagem das tabelas do Supabase
- `supabase/schema_public.sql`: schema principal em `public`

## Ambiente local

Crie/valide o arquivo `.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Impressão Pi / Zebra** — o app fala com o serviço `pi-print-ws` no Raspberry (`scripts/pi-print-ws` + CUPS): **60×30** na separação matriz→loja; **60×60** na **Produção** (ponte `industria`). Ver `docs/IMPRESSAO_TERMICA_ZEBRA.md` e `docs/RASPBERRY_INDUSTRIA_NOVO_PI.md`.

- **Produção / “de qualquer lugar”:** não precisa de `.env` por máquina. Aplique as migrações de `config_impressao_pi` (incl. `papel` estoque/industria) e preencha **`wss://…`** no Supabase, **ou** defina no **Railway** (recomendado com túnel nomeado) **`NEXT_PUBLIC_PI_PRINT_WS_URL_ESTOQUE`** e/ou **`NEXT_PUBLIC_PI_PRINT_WS_URL_INDUSTRIA`** — o app usa essa URL em vez do host gravado no banco e evita **ENOTFOUND** quando o quick tunnel rotaciona. Guias: **`docs/IMPRESSAO_PI_ACESSO_REMOTO.md`**, segundo Raspberry: **`docs/RASPBERRY_INDUSTRIA_NOVO_PI.md`**.
- **Só desenvolvimento na mesma LAN** (opcional), pode forçar via env (tem prioridade sobre o Supabase):

```env
NEXT_PUBLIC_PI_PRINT_WS_URL=ws://192.168.1.159:8765
NEXT_PUBLIC_PI_PRINT_WS_URL_ESTOQUE=
NEXT_PUBLIC_PI_PRINT_WS_URL_INDUSTRIA=
NEXT_PUBLIC_PI_PRINT_WS_TOKEN=
NEXT_PUBLIC_PI_PRINT_QUEUE=ZebraZD220
```

Reinicie `npm run dev` após alterar env. Token em `NEXT_PUBLIC_*` vai para o bundle.

**HTTPS:** use **`wss://`** na URL pública (túnel com TLS). `ws://` a partir de página `https://` costuma ser bloqueado.

## Como rodar

```bash
npm install
npm run dev
```

App local: [http://localhost:3000](http://localhost:3000)

## Login operacional (sem senhas no repositório)

- A tela `/login` não lista credenciais. Quem pode entrar depende do que está no Supabase (`login_operacional` + hash em `credenciais_login_operacional`).
- **Cadastro:** **Cadastros → Usuários** (`ADMIN_MASTER`) define ou altera usuário e senha.
- **Carga em lote (uma vez):** copie `scripts/operacional-seed.example.json` para `scripts/operacional-seed.local.json` (este último está no `.gitignore`), preencha os campos `"senha"`, garanta **Locais** e telefones alinhados ao JSON, depois `npm run seed:operacional` com `.env.local` contendo a service role.
- Operadores de loja precisam de `local_padrao_id` resolvido pelo nome da loja no seed (campo `lojaPadraoNome`) ou pelo cadastro manual. SQL de apoio: `docs/consultas-sql/upsert-operadoras-loja.sql`.

## Observacoes importantes do estado atual

- auth/OTP ainda esta simplificado para desenvolvimento
- permissoes de rota estao no cliente
- para ambiente de producao, reforcar politicas RLS por perfil/local
