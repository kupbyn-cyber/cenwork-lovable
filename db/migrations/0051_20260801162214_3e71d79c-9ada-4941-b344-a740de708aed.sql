-- 1) Lock down SECURITY DEFINER / public function execution
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Re-grant EXECUTE to authenticated ONLY for functions used by RLS policies or called by the app
DO $$
DECLARE r record;
  allowed text[] := ARRAY[
    'announcement_author','announcement_comments_open','announcement_is_active',
    'can_announce_to_team','can_announce_to_user','can_approve_deadline_change','can_create_task',
    'can_edit_announcement','can_edit_project_row','can_edit_task_row','can_manage_mvp_cycle',
    'can_manage_profile','can_manage_task','can_moderate_announcement','can_request_deadline_change',
    'can_review_daily_report','can_review_mvp','can_review_weekly_report','can_view_announcement',
    'can_view_daily_report','can_view_mvp_scorecard','can_view_project','can_view_task',
    'can_view_weekly_report','current_app_role','has_role','is_announcement_recipient',
    'is_mvp_cycle_published','is_project_person','is_project_team','is_system_admin','leader_team_id',
    'mvp_cycle_status_of','my_primary_team_id','my_team_ids',
    'announcement_acknowledge','announcement_duplicate','announcement_minor_revision',
    'announcement_new_version','announcement_revoke','announcement_set_archived',
    'deadline_change_decide','deadline_change_request','set_manual_archive',
    'project_decide','project_submit','soft_delete_entity'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname = ANY(allowed)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- 2) Avatars: restrict reads to the owner's folder or the profile that actually owns the file
DROP POLICY IF EXISTS "avatars_select_authenticated" ON storage.objects;
CREATE POLICY "avatars_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.avatar_path = objects.name
        AND p.id::text = (storage.foldername(objects.name))[1]
    )
  )
);

-- 3) telegram_config: explicit deny-all read policy (secrets stay server-side / service role only)
DROP POLICY IF EXISTS "telegram_config_no_client_select" ON public.telegram_config;
CREATE POLICY "telegram_config_no_client_select"
ON public.telegram_config FOR SELECT TO anon, authenticated
USING (false);
REVOKE ALL ON public.telegram_config FROM anon, authenticated;
GRANT ALL ON public.telegram_config TO service_role;

-- 4) user_roles: explicit deny of client-side writes (role changes only via trusted server code)
DROP POLICY IF EXISTS "user_roles_no_client_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_no_client_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_no_client_delete" ON public.user_roles;
CREATE POLICY "user_roles_no_client_insert"
ON public.user_roles FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "user_roles_no_client_update"
ON public.user_roles FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "user_roles_no_client_delete"
ON public.user_roles FOR DELETE TO anon, authenticated USING (false);
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;