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

- App Next.js: **Railway** (deploy via CLI `railway up` ou integração Git do projeto; detalhes em `LOG_SESSOES.md`, sessão *Deploy Railway*).
- Dados: **Supabase** (aplicar migrations em `supabase/migrations/` no projeto de produção quando o schema mudar).

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

- cada item fisico possui QR unico
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

**Impressão Pi / Zebra (60×30)** — o app fala com o serviço `pi-print-ws` no Raspberry (`scripts/pi-print-ws` + CUPS).

- **Produção / “de qualquer lugar”:** não precisa de `.env` por máquina. Aplique a migração `supabase/migrations/20260404140000_config_impressao_pi.sql` e preencha a tabela **`config_impressao_pi`** com URL **`wss://…`** (túnel até o Pi, ex. Cloudflare Tunnel). Guia: **`docs/IMPRESSAO_PI_ACESSO_REMOTO.md`**.
- **Só desenvolvimento na mesma LAN** (opcional), pode forçar via env (tem prioridade sobre o Supabase):

```env
NEXT_PUBLIC_PI_PRINT_WS_URL=ws://192.168.1.159:8765
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

## Acessos de desenvolvimento (login operacional)

Lista operacional (a tela `/login` **não** exibe senhas; uso interno / treinamento). Fonte: `src/lib/services/acesso.ts`:

- **Leonardo** / `123456` (indústria) — usuário `leonardo`
- **Joana** / `123456` (loja) — `joana`
- **Ludmilla** / `123456` (gerente) — `ludmilla`
- **Marco** / `654321` (administrador) — `marco`
- **Simone** / `123456` (loja, Loja Teste) — `simone`

Operadoras de loja (senha 6 dígitos **por pessoa**; login = primeira coluna em minúsculas: `luciene`, `francisca`, `julia`, `lara`, `silvania`):

| Nome      | Senha   | Loja (`locais.nome`)   |
|-----------|---------|-------------------------|
| Luciene   | `382941` | Loja JK                 |
| Francisca | `574028` | Loja Delivery           |
| Júlia     | `619357` | Loja Santa Cruz         |
| Lara      | `805426` | Loja Imperador Lara     |
| Silvania  | `973518` | Loja Jardim Paraíso     |

Cada loja precisa existir em **Cadastros → Locais** com tipo **Loja** e nome **exatamente** como na tabela.

## Observacoes importantes do estado atual

- auth/OTP ainda esta simplificado para desenvolvimento
- permissoes de rota estao no cliente
- para ambiente de producao, reforcar politicas RLS por perfil/local
