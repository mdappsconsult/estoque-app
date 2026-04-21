-- Bucket privado para imagens de nota fiscal (upload via service role / API operacional).
-- Usa só colunas base (id, name, public) para compatibilidade com projetos sem file_size_limit / allowed_mime_types na tabela.

INSERT INTO storage.buckets (id, name, public)
VALUES ('notas-compra', 'notas-compra', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;
