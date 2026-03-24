# Controle de Estoque - QR Unitario

PWA de controle de estoque por unidade, com rastreio por QR do inicio ao fim.

## Mapa de documentacao

- `README.md`: onboarding tecnico e visao geral
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

## Como rodar

```bash
npm install
npm run dev
```

App local: [http://localhost:3000](http://localhost:3000)

## Observacoes importantes do estado atual

- auth/OTP ainda esta simplificado para desenvolvimento
- permissoes de rota estao no cliente
- para ambiente de producao, reforcar politicas RLS por perfil/local
