-- =====================================================
-- SCHEMA: acai_kim - Controle de Estoque QR
-- Gerado em 2026-02-15
-- =====================================================

-- Criar schema se não existir
CREATE SCHEMA IF NOT EXISTS acai_kim;

-- =====================================================
-- TABELAS JÁ EXISTENTES (recriação segura com IF NOT EXISTS)
-- =====================================================

-- PRODUTOS
CREATE TABLE IF NOT EXISTS acai_kim.produtos (
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
CREATE TABLE IF NOT EXISTS acai_kim.grupos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#ef4444',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRODUTO_GRUPOS
CREATE TABLE IF NOT EXISTS acai_kim.produto_grupos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE,
  grupo_id UUID NOT NULL REFERENCES acai_kim.grupos(id) ON DELETE CASCADE,
  UNIQUE(produto_id, grupo_id)
);

-- CONSERVACOES
CREATE TABLE IF NOT EXISTS acai_kim.conservacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('resfriado', 'congelado', 'ambiente', 'quente')),
  status TEXT,
  dias INTEGER NOT NULL DEFAULT 0,
  horas INTEGER NOT NULL DEFAULT 0,
  minutos INTEGER NOT NULL DEFAULT 0
);

-- RECEBIMENTOS
CREATE TABLE IF NOT EXISTS acai_kim.recebimentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL,
  temperatura NUMERIC,
  data_recebimento TIMESTAMPTZ NOT NULL DEFAULT now(),
  fornecedor TEXT,
  nota_fiscal TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRODUCOES
CREATE TABLE IF NOT EXISTS acai_kim.producoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL,
  data_producao TIMESTAMPTZ NOT NULL DEFAULT now(),
  responsavel TEXT NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CONTAGENS
CREATE TABLE IF NOT EXISTS acai_kim.contagens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'finalizada')),
  responsavel TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CONTAGEM_ITENS
CREATE TABLE IF NOT EXISTS acai_kim.contagem_itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contagem_id UUID NOT NULL REFERENCES acai_kim.contagens(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE,
  quantidade_sistema INTEGER NOT NULL DEFAULT 0,
  quantidade_contada INTEGER NOT NULL DEFAULT 0
);

-- ETIQUETAS
CREATE TABLE IF NOT EXISTS acai_kim.etiquetas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE,
  data_producao TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_validade TIMESTAMPTZ NOT NULL,
  lote TEXT,
  impressa BOOLEAN NOT NULL DEFAULT false,
  excluida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ESTOQUE
CREATE TABLE IF NOT EXISTS acai_kim.estoque (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE UNIQUE,
  quantidade INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MOVIMENTACOES
CREATE TABLE IF NOT EXISTS acai_kim.movimentacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS acai_kim.locais (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('WAREHOUSE', 'STORE')),
  endereco TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- USUARIOS
CREATE TABLE IF NOT EXISTS acai_kim.usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL UNIQUE,
  perfil TEXT NOT NULL CHECK (perfil IN ('ADMIN_MASTER', 'MANAGER', 'OPERATOR_WAREHOUSE', 'OPERATOR_STORE', 'DRIVER')),
  local_padrao_id UUID REFERENCES acai_kim.locais(id),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LOTES_COMPRA
CREATE TABLE IF NOT EXISTS acai_kim.lotes_compra (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL,
  custo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  fornecedor TEXT,
  lote_fornecedor TEXT,
  local_id UUID NOT NULL REFERENCES acai_kim.locais(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ITENS (cada unidade física com QR)
CREATE TABLE IF NOT EXISTS acai_kim.itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_qr TEXT NOT NULL UNIQUE,
  token_short TEXT,
  produto_id UUID NOT NULL REFERENCES acai_kim.produtos(id) ON DELETE CASCADE,
  lote_compra_id UUID REFERENCES acai_kim.lotes_compra(id),
  local_atual_id UUID REFERENCES acai_kim.locais(id),
  estado TEXT NOT NULL DEFAULT 'EM_ESTOQUE' CHECK (estado IN ('EM_ESTOQUE', 'EM_TRANSFERENCIA', 'BAIXADO', 'DESCARTADO')),
  data_validade TIMESTAMPTZ,
  data_producao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VIAGENS (agrupamento de transferências para entrega)
CREATE TABLE IF NOT EXISTS acai_kim.viagens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  motorista_id UUID REFERENCES acai_kim.usuarios(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'IN_TRANSIT', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRANSFERENCIAS
CREATE TABLE IF NOT EXISTS acai_kim.transferencias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('WAREHOUSE_STORE', 'STORE_STORE')),
  origem_id UUID NOT NULL REFERENCES acai_kim.locais(id),
  destino_id UUID NOT NULL REFERENCES acai_kim.locais(id),
  viagem_id UUID REFERENCES acai_kim.viagens(id),
  status TEXT NOT NULL DEFAULT 'AWAITING_ACCEPT' CHECK (status IN ('AWAITING_ACCEPT', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'DIVERGENCE')),
  criado_por UUID NOT NULL REFERENCES acai_kim.usuarios(id),
  aceito_por UUID REFERENCES acai_kim.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRANSFERENCIA_ITENS
CREATE TABLE IF NOT EXISTS acai_kim.transferencia_itens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transferencia_id UUID NOT NULL REFERENCES acai_kim.transferencias(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES acai_kim.itens(id),
  recebido BOOLEAN NOT NULL DEFAULT false
);

-- DIVERGENCIAS
CREATE TABLE IF NOT EXISTS acai_kim.divergencias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transferencia_id UUID NOT NULL REFERENCES acai_kim.transferencias(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES acai_kim.itens(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('FALTANTE', 'EXCEDENTE')),
  resolvido BOOLEAN NOT NULL DEFAULT false,
  resolvido_por UUID REFERENCES acai_kim.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BAIXAS
CREATE TABLE IF NOT EXISTS acai_kim.baixas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES acai_kim.itens(id),
  local_id UUID NOT NULL REFERENCES acai_kim.locais(id),
  usuario_id UUID NOT NULL REFERENCES acai_kim.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PERDAS
CREATE TABLE IF NOT EXISTS acai_kim.perdas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES acai_kim.itens(id),
  motivo TEXT NOT NULL,
  local_id UUID NOT NULL REFERENCES acai_kim.locais(id),
  usuario_id UUID NOT NULL REFERENCES acai_kim.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDITORIA
CREATE TABLE IF NOT EXISTS acai_kim.auditoria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES acai_kim.usuarios(id),
  local_id UUID REFERENCES acai_kim.locais(id),
  acao TEXT NOT NULL,
  item_id UUID REFERENCES acai_kim.itens(id),
  origem_id UUID REFERENCES acai_kim.locais(id),
  destino_id UUID REFERENCES acai_kim.locais(id),
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- ENABLE RLS em TODAS as tabelas
-- =====================================================
ALTER TABLE acai_kim.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.produto_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.conservacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.recebimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.producoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.contagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.contagem_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.lotes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.viagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.transferencia_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.divergencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.baixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.perdas ENABLE ROW LEVEL SECURITY;
ALTER TABLE acai_kim.auditoria ENABLE ROW LEVEL SECURITY;

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
      DROP POLICY IF EXISTS "allow_all_%s" ON acai_kim.%I;
      CREATE POLICY "allow_all_%s" ON acai_kim.%I
        FOR ALL USING (true) WITH CHECK (true);
    ', t, t, t, t);
  END LOOP;
END $$;

-- =====================================================
-- HABILITAR REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.produtos;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.grupos;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.conservacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.recebimentos;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.producoes;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.contagens;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.contagem_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.etiquetas;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.estoque;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.movimentacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.locais;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.usuarios;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.lotes_compra;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.itens;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.viagens;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.transferencias;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.transferencia_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.divergencias;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.baixas;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.perdas;
ALTER PUBLICATION supabase_realtime ADD TABLE acai_kim.auditoria;

-- =====================================================
-- INDEXES para performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_itens_token_qr ON acai_kim.itens(token_qr);
CREATE INDEX IF NOT EXISTS idx_itens_produto_id ON acai_kim.itens(produto_id);
CREATE INDEX IF NOT EXISTS idx_itens_local_atual_id ON acai_kim.itens(local_atual_id);
CREATE INDEX IF NOT EXISTS idx_itens_estado ON acai_kim.itens(estado);
CREATE INDEX IF NOT EXISTS idx_transferencias_status ON acai_kim.transferencias(status);
CREATE INDEX IF NOT EXISTS idx_transferencias_origem ON acai_kim.transferencias(origem_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_destino ON acai_kim.transferencias(destino_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_item_id ON acai_kim.auditoria(item_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_id ON acai_kim.auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_lotes_compra_produto_id ON acai_kim.lotes_compra(produto_id);
CREATE INDEX IF NOT EXISTS idx_baixas_item_id ON acai_kim.baixas(item_id);
CREATE INDEX IF NOT EXISTS idx_perdas_item_id ON acai_kim.perdas(item_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON acai_kim.usuarios(telefone);
