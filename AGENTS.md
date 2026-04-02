# Instrucoes para agentes

## Idioma padrao

- Responder sempre em portugues (pt-BR).
- Manter tom claro, direto e colaborativo.
- So usar outro idioma se o usuario pedir explicitamente.

## Contexto automatico do projeto

- Em toda nova sessao, ler primeiro:
  - `CONTEXTO_ATUAL.md`
  - `LOG_SESSOES.md`
  - `docs/FLUXO_ENTREGA.md` (fluxo de entrega e o que manter sempre verde)
- Usar `CONTEXTO_ATUAL.md` como fonte canonica do estado vigente.
- Atualizar os dois arquivos ao finalizar mudancas relevantes:
  - `CONTEXTO_ATUAL.md` (estado atual)
  - `LOG_SESSOES.md` (historico da sessao)
- Antes de dar por encerrada uma mudanca que vai para `main`: garantir que **`npm run build`** passa (o CI do GitHub roda o mesmo gate).
- **MCP Supabase** deve apontar para o mesmo projeto que `.env.local`: `npm run sync:mcp-supabase` (e reiniciar MCP). Conferir ref: `npm run env:supabase-ref`. SQL de apoio: `docs/consultas-sql/`. Ver `docs/SUPABASE_AMBIENTE_E_MCP.md`.
