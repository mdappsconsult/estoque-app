-- Loja da operadora Silvania (OPERATOR_STORE); nome alinhado a `acesso.ts`.
INSERT INTO public.locais (nome, tipo, status)
SELECT 'Loja Jardim Paraíso', 'STORE', 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.locais WHERE nome = 'Loja Jardim Paraíso' AND tipo = 'STORE'
);
