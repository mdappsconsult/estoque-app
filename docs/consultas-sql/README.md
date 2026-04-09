# Consultas SQL (referência)

Scripts para colar no **SQL Editor** do projeto Supabase que está em `NEXT_PUBLIC_SUPABASE_URL` (confira com `npm run env:supabase-ref`).

| Arquivo              | Uso                          |
| -------------------- | ---------------------------- |
| `estoque-por-loja.sql` | Conferir resumo por produto na loja vs tela **Estoque** |
| `upsert-operadoras-loja.sql` | Garantir loja **Loja Jardim Paraíso** e `usuarios` das 5 operadoras (`OPERATOR_STORE`) |
| `caixa-unidade-rastreio-legado.sql` | Diagnóstico e notas para lotes/itens quando a unidade de rastreio deveria ser **caixa** e não peça |
| `correcao-galvanotek-porta-talher-2026-04-09.sql` | Registro da correção **1 QR = 1 caixa** (Galvanotek + Porta talher), já aplicada no projeto alinhado ao `.env.local` |
