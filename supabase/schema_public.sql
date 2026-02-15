-- Drop acai_kim schema if it exists (moving to public)
DROP SCHEMA IF EXISTS acai_kim CASCADE;

-- =====================================================
-- SCHEMA: acai_kim - Controle de Estoque QR
-- Gerado em 2026-02-15
-- =====================================================

-- Criar schema se não existir

-- =====================================================
-- TABELAS JÁ EXISTENTES (recriação segura com IF NOT EXISTS)
-- =====================================================

-- PRODUTOS
CREATE TABLE IF NOT EXISTS public.produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  medida TEXT,
  unidade_medida TEXT NOT NULL DEFAULT 'l',
  marca TEXT,
  fornecedor TEXT,
  sif TEXT,
  validade_dias INTEGER NOT NULL DEFAULT 0,
  validade_horas INTEGER NOT NULL DEFAULT 0,
  validade_minutos INTEGER NOT NULL DEFAULT 0,
  exibir_horario_etiqueta BOOLEAN NOT NULL DEFAULT false,
  contagem_do_dia BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GRUPOS
CREATE TABLE IF NOT EXISTS public.grupos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#ef4444',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRODUTO_GRUPOS
CREATE TABLE IF NOT EXISTS public.produto_grupos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  grupo_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  UNIQUE(produto_id, grupo_id)
);

-- CONSERVACOES
CREATE TABLE IF NOT EXISTS public.conservacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('resfriado', 'congelado', 'ambiente', 'quente')),
  status TEXT,
  dias INTEGER NOT NULL DEFAULT 0,
  horas INTEGER NOT NULL DEFAULT 0,
  minutos INTEGER NOT NULL DEFAULT 0
);

-- RECEBIMENTOS
CREATE TABLE IF NOT EXISTS public.recebimentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL,
  temperatura NUMERIC,
  data_recebimento TIMESTAMPTZ NOT NULL DEFAULT now(),
  fornecedor TEXT,
  nota_fiscal TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRODUCOES
CREATE TABLE IF NOT EXISTS public.producoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL,
  data_producao TIMESTAMPTZ NOT NULL DEFAULT now(),
  responsavel TEXT NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CONTAGENS
CREATE TABLE IF NOT EXISTS public.contagens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'finalizada')),
  responsavel TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CONTAGEM_ITENS
CREATE TABLE IF NOT EXISTS public.contagem_itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contagem_id UUID NOT NULL REFERENCES public.contagens(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade_sistema INTEGER NOT NULL DEFAULT 0,
  quantidade_contada INTEGER NOT NULL DEFAULT 0
);

-- ETIQUETAS
CREATE TABLE IF NOT EXISTS public.etiquetas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  data_producao TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_validade TIMESTAMPTZ NOT NULL,
  lote TEXT,
  impressa BOOLEAN NOT NULL DEFAULT false,
  excluida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ESTOQUE
CREATE TABLE IF NOT EXISTS public.estoque (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE UNIQUE,
  quantidade INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MOVIMENTACOES
CREATE TABLE IF NOT EXISTS public.movimentacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  quantidade INTEGER NOT NULL,
  motivo TEXT,
  referencia_id UUID,
  referencia_tipo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- NOVAS TABELAS
-- =====================================================

-- LOCAIS (Warehouse / Store)
CREATE TABLE IF NOT EXISTS public.locais (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('WAREHOUSE', 'STORE')),
  endereco TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- USUARIOS
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL UNIQUE,
  perfil TEXT NOT NULL CHECK (perfil IN ('ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE', 'DRIVER')),
  local_padrao_id UUID REFERENCES public.locais(id),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LOTES_COMPRA
CREATE TABLE IF NOT EXISTS public.lotes_compra (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL,
  custo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  fornecedor TEXT,
  lote_fornecedor TEXT,
  local_id UUID NOT NULL REFERENCES public.locais(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ITENS (cada unidade física com QR)
CREATE TABLE IF NOT EXISTS public.itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_qr TEXT NOT NULL UNIQUE,
  token_short TEXT,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  lote_compra_id UUID REFERENCES public.lotes_compra(id),
  local_atual_id UUID REFERENCES public.locais(id),
  estado TEXT NOT NULL DEFAULT 'EM_ESTOQUE' CHECK (estado IN ('EM_ESTOQUE', 'EM_TRANSFERENCIA', 'BAIXADO', 'DESCARTADO')),
  data_validade TIMESTAMPTZ,
  data_producao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VIAGENS (agrupamento de transferências para entrega)
CREATE TABLE IF NOT EXISTS public.viagens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  motorista_id UUID REFERENCES public.usuarios(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'IN_TRANSIT', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRANSFERENCIAS
CREATE TABLE IF NOT EXISTS public.transferencias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('WAREHOUSE_STORE', 'STORE_STORE')),
  origem_id UUID NOT NULL REFERENCES public.locais(id),
  destino_id UUID NOT NULL REFERENCES public.locais(id),
  viagem_id UUID REFERENCES public.viagens(id),
  status TEXT NOT NULL DEFAULT 'AWAITING_ACCEPT' CHECK (status IN ('AWAITING_ACCEPT', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'DIVERGENCE')),
  criado_por UUID NOT NULL REFERENCES public.usuarios(id),
  aceito_por UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRANSFERENCIA_ITENS
CREATE TABLE IF NOT EXISTS public.transferencia_itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transferencia_id UUID NOT NULL REFERENCES public.transferencias(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.itens(id),
  recebido BOOLEAN NOT NULL DEFAULT false
);

-- DIVERGENCIAS
CREATE TABLE IF NOT EXISTS public.divergencias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transferencia_id UUID NOT NULL REFERENCES public.transferencias(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.itens(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('FALTANTE', 'EXCEDENTE')),
  resolvido BOOLEAN NOT NULL DEFAULT false,
  resolvido_por UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BAIXAS
CREATE TABLE IF NOT EXISTS public.baixas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.itens(id),
  local_id UUID NOT NULL REFERENCES public.locais(id),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PERDAS
CREATE TABLE IF NOT EXISTS public.perdas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.itens(id),
  motivo TEXT NOT NULL,
  local_id UUID NOT NULL REFERENCES public.locais(id),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDITORIA
CREATE TABLE IF NOT EXISTS public.auditoria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES public.usuarios(id),
  local_id UUID REFERENCES public.locais(id),
  acao TEXT NOT NULL,
  item_id UUID REFERENCES public.itens(id),
  origem_id UUID REFERENCES public.locais(id),
  destino_id UUID REFERENCES public.locais(id),
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- ENABLE RLS em TODAS as tabelas
-- =====================================================
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conservacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contagem_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencia_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divergencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perdas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES (permitir tudo com service_role / anon por enquanto)
-- Depois refinar por perfil de usuário
-- =====================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'produtos','grupos','produto_grupos','conservacoes',
    'recebimentos','producoes','contagens','contagem_itens',
    'etiquetas','estoque','movimentacoes',
    'locais','usuarios','lotes_compra','itens',
    'viagens','transferencias','transferencia_itens',
    'divergencias','baixas','perdas','auditoria'
  ])
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "allow_all_%s" ON public.%I;
      CREATE POLICY "allow_all_%s" ON public.%I
        FOR ALL USING (true) WITH CHECK (true);
    ', t, t, t, t);
  END LOOP;
END $$;

-- =====================================================
-- HABILITAR REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.produtos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.grupos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conservacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recebimentos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.producoes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contagem_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.etiquetas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.estoque;
ALTER PUBLICATION supabase_realtime ADD TABLE public.movimentacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.locais;
ALTER PUBLICATION supabase_realtime ADD TABLE public.usuarios;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lotes_compra;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.viagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transferencias;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transferencia_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.divergencias;
ALTER PUBLICATION supabase_realtime ADD TABLE public.baixas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.perdas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auditoria;

-- =====================================================
-- INDEXES para performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_itens_token_qr ON public.itens(token_qr);
CREATE INDEX IF NOT EXISTS idx_itens_produto_id ON public.itens(produto_id);
CREATE INDEX IF NOT EXISTS idx_itens_local_atual_id ON public.itens(local_atual_id);
CREATE INDEX IF NOT EXISTS idx_itens_estado ON public.itens(estado);
CREATE INDEX IF NOT EXISTS idx_transferencias_status ON public.transferencias(status);
CREATE INDEX IF NOT EXISTS idx_transferencias_origem ON public.transferencias(origem_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_destino ON public.transferencias(destino_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_item_id ON public.auditoria(item_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_id ON public.auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_lotes_compra_produto_id ON public.lotes_compra(produto_id);
CREATE INDEX IF NOT EXISTS idx_baixas_item_id ON public.baixas(item_id);
CREATE INDEX IF NOT EXISTS idx_perdas_item_id ON public.perdas(item_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON public.usuarios(telefone);
