-- Adiciona suporte a leitura por código de barras (EAN/GTIN) no cadastro de produtos.
-- Usado pela tela operacional "Registrar produto (câmera)".

alter table public.produtos
  add column if not exists codigo_barras text;

create index if not exists produtos_codigo_barras_idx
  on public.produtos (codigo_barras);

