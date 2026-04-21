-- Criar/atualizar bucket de imagens de nota (Registrar compra — foto NF).
-- Use no SQL Editor do Supabase se a migração ainda não rodou ou falhou.

INSERT INTO storage.buckets (id, name, public)
VALUES ('notas-compra', 'notas-compra', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

-- Opcional: limite 10 MB e MIME (só se as colunas existirem no seu projeto)
-- UPDATE storage.buckets
-- SET file_size_limit = 10485760,
--     allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
-- WHERE id = 'notas-compra';
