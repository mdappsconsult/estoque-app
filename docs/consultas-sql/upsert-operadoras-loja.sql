-- Operadoras de loja: alinhar tabela `usuarios` ao app (`src/lib/services/acesso.ts`).
-- Telefones sintéticos 550000000011–015 batem com o upsert no login.
-- Executar no SQL Editor (papel com permissão em `usuarios` / `locais`).

-- Loja da Silvania (criar se ainda não existir)
INSERT INTO public.locais (nome, tipo, status)
SELECT 'Loja Jardim Paraíso', 'STORE', 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.locais WHERE nome = 'Loja Jardim Paraíso' AND tipo = 'STORE'
);

-- Nomes de `locais` devem bater com o cadastro (ex.: "Delivery", não "Loja Delivery")
INSERT INTO public.usuarios (nome, telefone, perfil, local_padrao_id, status)
SELECT v.nome, v.telefone, 'OPERATOR_STORE', l.id, 'ativo'
FROM (
  VALUES
    ('Luciene', '550000000011', 'Loja JK'),
    ('Francisca', '550000000012', 'Delivery'),
    ('Júlia', '550000000013', 'Loja Santa Cruz'),
    ('Lara', '550000000014', 'Loja Imperador'),
    ('Silvania', '550000000015', 'Loja Jardim Paraíso')
) AS v(nome, telefone, loja_nome)
JOIN public.locais l ON l.tipo = 'STORE' AND l.status = 'ativo' AND l.nome = v.loja_nome
ON CONFLICT (telefone) DO UPDATE SET
  nome = EXCLUDED.nome,
  perfil = EXCLUDED.perfil,
  local_padrao_id = EXCLUDED.local_padrao_id,
  status = 'ativo';
