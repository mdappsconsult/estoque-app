-- Sistema de protocolos internos (pedidos/chamados da operação para a secretaria).
-- Estrutura: 1 tabela principal + comentários + configuração de prazos + bucket de fotos
-- + índice em auditoria.detalhes->>'protocolo_id' para alimentar a timeline.

-- ============================================================================
-- 1) Tabela principal de protocolos
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.protocolos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint GENERATED ALWAYS AS IDENTITY,
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 80),
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) >= 1),
  local_id uuid REFERENCES public.locais(id) ON DELETE SET NULL,
  prioridade text NOT NULL DEFAULT 'MEDIA'
    CHECK (prioridade IN ('BAIXA','MEDIA','ALTA','URGENTE')),
  status text NOT NULL DEFAULT 'ABERTO'
    CHECK (status IN ('ABERTO','ACEITO','EM_EXECUCAO','CONCLUIDO','FECHADO','RECUSADO')),
  responsavel_externo text,
  aberto_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  gerente_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motivo_recusa text,
  observacao_fechamento text,
  foto_path text,
  reaberto_de uuid REFERENCES public.protocolos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  aceito_em timestamptz,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  fechado_em timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS protocolos_numero_idx ON public.protocolos(numero);
CREATE INDEX IF NOT EXISTS protocolos_status_created_at_idx
  ON public.protocolos(status, created_at DESC);
CREATE INDEX IF NOT EXISTS protocolos_aberto_por_idx
  ON public.protocolos(aberto_por);
CREATE INDEX IF NOT EXISTS protocolos_local_id_idx
  ON public.protocolos(local_id);
CREATE INDEX IF NOT EXISTS protocolos_prioridade_idx
  ON public.protocolos(prioridade);

-- ============================================================================
-- 2) Comentários (linha do tempo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.protocolo_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo_id uuid NOT NULL REFERENCES public.protocolos(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  texto text NOT NULL CHECK (char_length(btrim(texto)) >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS protocolo_comentarios_protocolo_id_idx
  ON public.protocolo_comentarios(protocolo_id, created_at);

-- ============================================================================
-- 3) Configuração de prazos por prioridade (apenas ADMIN_MASTER edita pela UI)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.protocolo_prazos_config (
  prioridade text PRIMARY KEY
    CHECK (prioridade IN ('BAIXA','MEDIA','ALTA','URGENTE')),
  horas_para_aceitar int NOT NULL CHECK (horas_para_aceitar > 0),
  dias_para_fechar int NOT NULL CHECK (dias_para_fechar > 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);

INSERT INTO public.protocolo_prazos_config (prioridade, horas_para_aceitar, dias_para_fechar)
VALUES
  ('URGENTE', 1,  1),
  ('ALTA',    4,  3),
  ('MEDIA',  12,  7),
  ('BAIXA',  24, 15)
ON CONFLICT (prioridade) DO NOTHING;

-- ============================================================================
-- 4) Índice expressional na auditoria para alimentar a timeline do protocolo
-- ============================================================================
CREATE INDEX IF NOT EXISTS auditoria_protocolo_id_idx
  ON public.auditoria ((detalhes->>'protocolo_id'))
  WHERE acao LIKE '%PROTOCOLO%';

-- ============================================================================
-- 5) Bucket de fotos de protocolos (privado; acesso via Service Role/API)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('protocolos-fotos', 'protocolos-fotos', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;
