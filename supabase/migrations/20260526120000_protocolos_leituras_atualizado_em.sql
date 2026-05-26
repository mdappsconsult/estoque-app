-- Leituras por usuário (badge estilo WhatsApp) + coluna atualizado_em nos protocolos.
-- `atualizado_em` sobe em UPDATE do protocolo e em INSERT de comentário.

ALTER TABLE public.protocolos
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

-- Backfill: última atividade conhecida pelos timestamps de status.
UPDATE public.protocolos p
SET atualizado_em = GREATEST(
  p.created_at,
  COALESCE(p.aceito_em, p.created_at),
  COALESCE(p.iniciado_em, p.created_at),
  COALESCE(p.concluido_em, p.created_at),
  COALESCE(p.fechado_em, p.created_at),
  COALESCE(
    (SELECT MAX(c.created_at) FROM public.protocolo_comentarios c WHERE c.protocolo_id = p.id),
    p.created_at
  )
)
WHERE p.atualizado_em = p.created_at OR p.atualizado_em IS NULL;

CREATE OR REPLACE FUNCTION public.protocolos_bump_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protocolos_atualizado_em_trg ON public.protocolos;
CREATE TRIGGER protocolos_atualizado_em_trg
  BEFORE UPDATE ON public.protocolos
  FOR EACH ROW
  EXECUTE FUNCTION public.protocolos_bump_atualizado_em();

CREATE OR REPLACE FUNCTION public.protocolo_comentario_bump_protocolo()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.protocolos
  SET atualizado_em = now()
  WHERE id = NEW.protocolo_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protocolo_comentarios_bump_trg ON public.protocolo_comentarios;
CREATE TRIGGER protocolo_comentarios_bump_trg
  AFTER INSERT ON public.protocolo_comentarios
  FOR EACH ROW
  EXECUTE FUNCTION public.protocolo_comentario_bump_protocolo();

-- Marcação de «visto» por usuário (badge no header e nos cards).
CREATE TABLE IF NOT EXISTS public.protocolo_leituras (
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  protocolo_id uuid NOT NULL REFERENCES public.protocolos(id) ON DELETE CASCADE,
  visto_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, protocolo_id)
);

CREATE INDEX IF NOT EXISTS protocolo_leituras_usuario_idx
  ON public.protocolo_leituras(usuario_id);

COMMENT ON TABLE public.protocolo_leituras IS
  'Última visualização do pedido por usuário — alimenta badge de não lidos (msg/status).';

COMMENT ON COLUMN public.protocolos.atualizado_em IS
  'Última mudança relevante (status, prioridade, comentário). Comparado com protocolo_leituras.visto_em.';
