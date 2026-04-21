-- Receitas pré-configuradas para a tela Produção → Insumos gastos.

CREATE TABLE IF NOT EXISTS public.producao_receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  produto_acabado_id UUID REFERENCES public.produtos (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT producao_receitas_nome_unique UNIQUE (nome)
);

COMMENT ON TABLE public.producao_receitas IS
  'Modelo de insumos para Produção; opcionalmente vinculado ao produto acabado.';
COMMENT ON COLUMN public.producao_receitas.produto_acabado_id IS
  'Se preenchido, a UI pode avisar quando o acabado selecionado divergir da receita.';

CREATE TABLE IF NOT EXISTS public.producao_receita_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL REFERENCES public.producao_receitas (id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  produto_id UUID NOT NULL REFERENCES public.produtos (id) ON DELETE CASCADE,
  qtd_qr INTEGER,
  massa_valor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.producao_receita_itens.qtd_qr IS
  'Unidades QR quando o produto não usa consumo por massa.';
COMMENT ON COLUMN public.producao_receita_itens.massa_valor IS
  'Texto como na tela Produção: doses ou kg (vírgula/ponto).';

CREATE INDEX IF NOT EXISTS idx_producao_receita_itens_receita ON public.producao_receita_itens (receita_id);
CREATE INDEX IF NOT EXISTS idx_producao_receita_itens_produto ON public.producao_receita_itens (produto_id);
CREATE INDEX IF NOT EXISTS idx_producao_receitas_acabado ON public.producao_receitas (produto_acabado_id);

ALTER TABLE public.producao_receitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_receita_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_producao_receitas" ON public.producao_receitas;
CREATE POLICY "allow_all_producao_receitas" ON public.producao_receitas
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_producao_receita_itens" ON public.producao_receita_itens;
CREATE POLICY "allow_all_producao_receita_itens" ON public.producao_receita_itens
  FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.producao_receitas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.producao_receita_itens;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
