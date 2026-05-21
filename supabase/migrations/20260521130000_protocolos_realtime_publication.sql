-- Inscreve as tabelas de protocolos na publication `supabase_realtime` para que
-- o Postgres emita eventos de INSERT/UPDATE/DELETE e o cliente (postgres_changes)
-- atualize a tela na hora — sem precisar dar F5.
-- Tabelas novas no Supabase NÃO entram automaticamente nessa publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'protocolos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.protocolos';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'protocolo_comentarios'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.protocolo_comentarios';
  END IF;
END $$;

-- `REPLICA IDENTITY FULL` garante que UPDATE/DELETE tragam o registro completo
-- no payload do realtime (sem isso, alguns clientes recebem só as colunas mudadas).
ALTER TABLE public.protocolos REPLICA IDENTITY FULL;
ALTER TABLE public.protocolo_comentarios REPLICA IDENTITY FULL;
