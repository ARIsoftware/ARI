-- Rename hello-world module table and indexes/policies to module-template
-- Safe to run if the old table exists; no-op otherwise.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hello_world_entries') THEN
    ALTER TABLE public.hello_world_entries RENAME TO module_template_entries;

    ALTER INDEX IF EXISTS idx_hello_world_entries_created_at RENAME TO idx_module_template_entries_created_at;
    ALTER INDEX IF EXISTS idx_hello_world_entries_user_created RENAME TO idx_module_template_entries_user_created;
    ALTER INDEX IF EXISTS idx_hello_world_entries_user_id RENAME TO idx_module_template_entries_user_id;

    ALTER POLICY hello_world_entries_rls_select ON public.module_template_entries RENAME TO module_template_entries_rls_select;
    ALTER POLICY hello_world_entries_rls_insert ON public.module_template_entries RENAME TO module_template_entries_rls_insert;
    ALTER POLICY hello_world_entries_rls_update ON public.module_template_entries RENAME TO module_template_entries_rls_update;
    ALTER POLICY hello_world_entries_rls_delete ON public.module_template_entries RENAME TO module_template_entries_rls_delete;
  END IF;
END $$;
