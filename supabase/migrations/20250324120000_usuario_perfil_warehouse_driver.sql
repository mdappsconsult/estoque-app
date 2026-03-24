-- Adiciona perfil OPERATOR_WAREHOUSE_DRIVER (indústria + motorista).
-- Execute o bloco que corresponde ao schema do seu projeto (public ou acai_kim).

-- Schema public (Supabase padrão)
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (
  perfil IN (
    'ADMIN_MASTER',
    'MANAGER',
    'OPERATOR_WAREHOUSE',
    'OPERATOR_WAREHOUSE_DRIVER',
    'OPERATOR_STORE',
    'DRIVER'
  )
);

-- Descomente se usar schema acai_kim:
-- ALTER TABLE acai_kim.usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
-- ALTER TABLE acai_kim.usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (
--   perfil IN (
--     'ADMIN_MASTER',
--     'MANAGER',
--     'OPERATOR_WAREHOUSE',
--     'OPERATOR_WAREHOUSE_DRIVER',
--     'OPERATOR_STORE',
--     'DRIVER'
--   )
-- );
