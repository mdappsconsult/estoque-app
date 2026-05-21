-- Protocolos: suporte a até 3 fotos por pedido (antes era 1 só, em `foto_path text`).
-- Mantém `foto_path` por enquanto (deprecated, populado com `foto_paths[1]` para compat de leitura
-- em registros antigos / auditoria). Migrações futuras podem dropar a coluna depois que o app
-- estiver 100% lendo `foto_paths`.

ALTER TABLE public.protocolos
  ADD COLUMN IF NOT EXISTS foto_paths text[] NOT NULL DEFAULT '{}'::text[];

-- Backfill: registros antigos com 1 foto vão para o array.
UPDATE public.protocolos
SET foto_paths = ARRAY[foto_path]::text[]
WHERE foto_path IS NOT NULL
  AND (array_length(foto_paths, 1) IS NULL);

-- Trava limite de 3 fotos no banco (mesma regra do client).
ALTER TABLE public.protocolos
  DROP CONSTRAINT IF EXISTS protocolos_foto_paths_max_check;

ALTER TABLE public.protocolos
  ADD CONSTRAINT protocolos_foto_paths_max_check
  CHECK (array_length(foto_paths, 1) IS NULL OR array_length(foto_paths, 1) <= 3);

COMMENT ON COLUMN public.protocolos.foto_paths IS
  'Até 3 fotos por protocolo (paths no bucket privado `protocolos-fotos`). Backfill: ARRAY[foto_path] quando havia 1.';
COMMENT ON COLUMN public.protocolos.foto_path IS
  'DEPRECATED: mantido para registros antigos / auditoria. Use foto_paths.';
