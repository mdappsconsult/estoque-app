-- Recebimento colaborativo: cada bip persiste no servidor (vs. estado local de hoje).
-- Adiciona auditoria por linha: quem foi o funcionário que bipou esse QR e quando.
-- A publication supabase_realtime já inclui `transferencia_itens` (schema_public.sql) — nada a alterar aqui.
-- Sem backfill (linhas antigas ficam com NULL — comportamento legado do fluxo batch preservado).

ALTER TABLE public.transferencia_itens
  ADD COLUMN IF NOT EXISTS recebido_por_usuario_id uuid REFERENCES public.usuarios(id);

ALTER TABLE public.transferencia_itens
  ADD COLUMN IF NOT EXISTS recebido_em timestamptz;

-- Acelera o «X de Y» do painel de recebimento (count de pendentes por remessa).
CREATE INDEX IF NOT EXISTS transferencia_itens_remessa_pendente_idx
  ON public.transferencia_itens (transferencia_id)
  WHERE recebido = false;

COMMENT ON COLUMN public.transferencia_itens.recebido_por_usuario_id IS
  'Funcionário que bipou esta unidade em /recebimento (multi-bipador colaborativo). NULL = batch legado.';
COMMENT ON COLUMN public.transferencia_itens.recebido_em IS
  'Instante do bip colaborativo (per-linha). NULL em recebimento batch legado.';
