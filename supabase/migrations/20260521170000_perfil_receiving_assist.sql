-- Novo perfil `RECEIVING_ASSIST` (Ajudante de recebimento).
-- Acesso só ao card "Receber Entrega" — usado por reforço de mão de obra na loja durante
-- bipagem colaborativa de grandes remessas. Pode existir em qualquer loja (escopo via
-- `usuarios.local_padrao_id`, mesmo padrão de `OPERATOR_STORE`).
-- Sem RLS para adicionar — o controle é app-side (`src/lib/permissions.ts`).

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_perfil_check;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_perfil_check CHECK (perfil = ANY (ARRAY[
    'ADMIN_MASTER'::text,
    'MANAGER'::text,
    'OPERATOR_WAREHOUSE'::text,
    'OPERATOR_WAREHOUSE_DRIVER'::text,
    'OPERATOR_STORE'::text,
    'RECEIVING_ASSIST'::text,
    'DRIVER'::text
  ]));
