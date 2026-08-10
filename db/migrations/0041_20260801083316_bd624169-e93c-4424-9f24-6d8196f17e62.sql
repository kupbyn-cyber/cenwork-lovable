-- 1) Audit logs: scope report entries to users who may view the report
DROP POLICY IF EXISTS audit_logs_select_daily_report ON public.audit_logs;
CREATE POLICY audit_logs_select_daily_report ON public.audit_logs
FOR SELECT TO authenticated
USING (
  entity_type = 'daily_report' AND entity_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.daily_reports r
    WHERE r.id = audit_logs.entity_id
      AND public.can_view_daily_report(r.author_id, r.team_id)
  )
);

DROP POLICY IF EXISTS audit_logs_select_weekly_report ON public.audit_logs;
CREATE POLICY audit_logs_select_weekly_report ON public.audit_logs
FOR SELECT TO authenticated
USING (
  entity_type = 'weekly_report' AND entity_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.weekly_reports r
    WHERE r.id = audit_logs.entity_id
      AND public.can_view_weekly_report(r.team_id)
  )
);

-- 2) Storage: only own folder or a profile's current avatar file
DROP POLICY IF EXISTS avatars_select_authenticated ON storage.objects;
CREATE POLICY avatars_select_authenticated ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.avatar_path = storage.objects.name)
  )
);

-- 3) Telegram config holds the bot token: unreachable through the Data API
REVOKE ALL ON public.telegram_config FROM anon, authenticated;
GRANT ALL ON public.telegram_config TO service_role;

-- 4) SECURITY DEFINER functions: no anonymous execution at all
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, t.typname AS rettype, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_type t ON t.oid = p.prorettype
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    -- trigger functions and internal notification plumbing are never called directly by clients
    IF r.rettype = 'trigger'
       OR r.proname IN ('notify_user','notify_team_telegram','enqueue_telegram_user','write_audit_internal')
    THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;