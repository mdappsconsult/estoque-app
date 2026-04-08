-- Etiquetas: FK para itens (id 1:1) — permite join embutido no PostgREST e elimina N+1 no app.
-- Remove linhas órfãs (etiqueta sem unidade) antes de criar a constraint.

DELETE FROM public.etiquetas e
WHERE NOT EXISTS (SELECT 1 FROM public.itens i WHERE i.id = e.id);

ALTER TABLE public.etiquetas
  ADD CONSTRAINT etiquetas_id_refs_itens_id_fkey
  FOREIGN KEY (id) REFERENCES public.itens(id) ON DELETE CASCADE;
