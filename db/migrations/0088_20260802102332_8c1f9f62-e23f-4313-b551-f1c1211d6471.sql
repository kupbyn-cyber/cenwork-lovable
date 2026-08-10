-- ============ ROLE-01: dynamic permissions ============
CREATE TABLE IF NOT EXISTS public.permission_catalog (
  permission_key text PRIMARY KEY,
  module text NOT NULL,
  label text NOT NULL,
  description text,
  allowed_scopes text[] NOT NULL DEFAULT ARRAY['organization']::text[],
  is_configurable boolean NOT NULL DEFAULT true,
  is_sensitive boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_catalog TO authenticated;
GRANT ALL ON public.permission_catalog TO service_role;
ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog readable" ON public.permission_catalog FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.role_permission_config (
  role public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permission_catalog(permission_key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  data_scope text NOT NULL DEFAULT 'organization',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission_key)
);
GRANT SELECT ON public.role_permission_config TO authenticated;
GRANT ALL ON public.role_permission_config TO service_role;
ALTER TABLE public.role_permission_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role config readable" ON public.role_permission_config FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permission_catalog(permission_key) ON DELETE CASCADE,
  override_type text NOT NULL CHECK (override_type IN ('allow','deny')),
  data_scope text,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);
GRANT SELECT ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "overrides readable" ON public.user_permission_overrides FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.permission_change_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason text NOT NULL,
  kind text NOT NULL DEFAULT 'update',
  changes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reverted_at timestamptz,
  reverted_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_change_sets TO authenticated;
GRANT ALL ON public.permission_change_sets TO service_role;
ALTER TABLE public.permission_change_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "change sets readable" ON public.permission_change_sets FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.system_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_owners TO authenticated;
GRANT ALL ON public.system_owners TO service_role;
ALTER TABLE public.system_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners readable" ON public.system_owners FOR SELECT TO authenticated USING (true);

-- ============ catalog seed ============
INSERT INTO public.permission_catalog (permission_key, module, label, allowed_scopes, is_configurable, is_sensitive, sort_order) VALUES
 ('members.view','Thành viên','Xem danh sách thành viên',ARRAY['own','team','organization'],true,false,10),
 ('members.create','Thành viên','Tạo tài khoản thành viên',ARRAY['organization'],true,true,11),
 ('members.edit_scoped','Thành viên','Sửa hồ sơ thành viên trong phạm vi',ARRAY['own','team','organization'],true,true,12),
 ('members.lock','Thành viên','Khóa / mở khóa tài khoản',ARRAY['organization'],true,true,13),
 ('members.reset_password','Thành viên','Cấp mật khẩu tạm cho Leader / Member',ARRAY['organization'],true,true,14),
 ('roles.view','Vai trò','Xem vai trò và quyền',ARRAY['organization'],true,false,20),
 ('roles.assign','Vai trò','Gán vai trò hệ thống',ARRAY['organization'],true,true,21),
 ('permissions.manage','Vai trò','Quản lý phân quyền động',ARRAY['organization'],true,true,22),
 ('organization.view','Tổ chức','Xem Team và Cơ sở',ARRAY['team','organization'],true,false,30),
 ('organization.manage','Tổ chức','Tạo / sửa Team và Cơ sở',ARRAY['organization'],true,true,31),
 ('settings.admin','Hệ thống','Cấu hình quản trị hệ thống',ARRAY['organization'],true,true,40),
 ('audit.view','Hệ thống','Xem nhật ký hoạt động',ARRAY['organization'],true,true,41),
 ('telegram.manage','Hệ thống','Quản lý kết nối Telegram',ARRAY['organization'],true,true,42),
 ('projects.view','Dự án','Xem dự án trong phạm vi',ARRAY['own','assigned_or_participating','team','related_projects','organization'],true,false,50),
 ('projects.create','Dự án','Tạo dự án',ARRAY['organization'],true,false,51),
 ('projects.approve_leader','Dự án','Duyệt dự án ở bước Leader',ARRAY['team','organization'],true,false,52),
 ('projects.approve_cmo','Dự án','Duyệt dự án ở bước CMO',ARRAY['organization'],true,false,53),
 ('tasks.view','Công việc','Xem công việc trong phạm vi',ARRAY['own','assigned_or_participating','team','related_projects','organization'],true,false,60),
 ('tasks.create','Công việc','Tạo công việc',ARRAY['organization'],true,false,61),
 ('reports.view','Báo cáo','Xem báo cáo trong phạm vi',ARRAY['own','team','organization'],true,false,70),
 ('reports.submit_daily','Báo cáo','Gửi báo cáo ngày',ARRAY['own'],true,false,71),
 ('reports.review_daily','Báo cáo','Duyệt báo cáo ngày',ARRAY['team','organization'],true,false,72),
 ('reports.submit_weekly','Báo cáo','Gửi báo cáo tuần của Team',ARRAY['team'],true,false,73),
 ('reports.review_weekly','Báo cáo','Duyệt báo cáo tuần',ARRAY['team','organization'],true,false,74),
 ('reports.obligations_view','Báo cáo','Xem nghĩa vụ báo cáo trong phạm vi',ARRAY['own','team','organization'],true,false,75),
 ('reports.config','Báo cáo','Cấu hình quy tắc và kỳ báo cáo',ARRAY['organization'],true,true,76),
 ('mvp.view','MVP và danh hiệu','Xem MVP và danh hiệu',ARRAY['own','team','organization'],true,false,80),
 ('mvp.vote','MVP và danh hiệu','Bỏ phiếu MVP',ARRAY['organization'],true,false,81),
 ('mvp.review','MVP và danh hiệu','Chấm điểm đánh giá thực tế',ARRAY['team','organization'],true,false,82),
 ('mvp.approve','MVP và danh hiệu','Phê duyệt và công bố danh hiệu',ARRAY['organization'],true,true,83),
 ('mvp.manage','MVP và danh hiệu','Quản lý kỳ MVP và dữ liệu chấm điểm',ARRAY['organization'],true,true,84),
 ('announcements.view','Thông báo nội bộ','Xem thông báo nội bộ',ARRAY['organization'],true,false,90),
 ('announcements.create','Thông báo nội bộ','Soạn và phát hành thông báo nội bộ',ARRAY['organization'],true,false,91),
 ('approvals.view','Phê duyệt','Xem module Phê duyệt',ARRAY['organization'],true,false,95),
 ('approvals.create','Phê duyệt','Tạo yêu cầu phê duyệt',ARRAY['organization'],true,false,96),
 ('approvals.admin_view','Phê duyệt','Xem toàn bộ yêu cầu phê duyệt trong hệ thống',ARRAY['organization'],true,true,97)
ON CONFLICT (permission_key) DO NOTHING;

-- ============ role config seed (mirrors the live hardcoded matrix) ============
DO $$
DECLARE
  admin_keys text[] := ARRAY['members.view','members.create','members.edit_scoped','members.lock','members.reset_password','roles.view','roles.assign','permissions.manage','organization.view','organization.manage','settings.admin','audit.view','projects.view','projects.create','projects.approve_leader','projects.approve_cmo','tasks.view','tasks.create','reports.view','reports.submit_daily','reports.review_daily','reports.review_weekly','reports.obligations_view','telegram.manage','mvp.view','mvp.vote','mvp.manage','mvp.review','mvp.approve','announcements.view','announcements.create','approvals.view','approvals.create','approvals.admin_view'];
  cmo_keys text[];
  leader_keys text[] := ARRAY['members.view','members.edit_scoped','roles.view','organization.view','projects.view','projects.create','projects.approve_leader','tasks.view','tasks.create','reports.view','reports.submit_daily','reports.review_daily','reports.submit_weekly','reports.obligations_view','mvp.view','mvp.vote','mvp.review','announcements.view','announcements.create','approvals.view','approvals.create'];
  member_keys text[] := ARRAY['organization.view','projects.view','projects.create','tasks.view','tasks.create','reports.view','reports.submit_daily','reports.obligations_view','mvp.view','mvp.vote','announcements.view','announcements.create','approvals.view','approvals.create'];
  r public.app_role;
  c record;
  keys text[];
  pref text[];
  s text;
  chosen text;
BEGIN
  cmo_keys := admin_keys || ARRAY['reports.config'];
  FOREACH r IN ARRAY ARRAY['admin','cmo','leader','member']::public.app_role[] LOOP
    keys := CASE r WHEN 'admin' THEN admin_keys WHEN 'cmo' THEN cmo_keys WHEN 'leader' THEN leader_keys ELSE member_keys END;
    pref := CASE r
      WHEN 'leader' THEN ARRAY['team','related_projects','assigned_or_participating','own','organization']
      WHEN 'member' THEN ARRAY['assigned_or_participating','own','team','related_projects','organization']
      ELSE ARRAY['organization','team','related_projects','assigned_or_participating','own'] END;
    FOR c IN SELECT * FROM public.permission_catalog LOOP
      chosen := NULL;
      FOREACH s IN ARRAY pref LOOP
        IF chosen IS NULL AND s = ANY(c.allowed_scopes) THEN chosen := s; END IF;
      END LOOP;
      INSERT INTO public.role_permission_config(role, permission_key, enabled, data_scope)
      VALUES (r, c.permission_key, c.permission_key = ANY(keys), COALESCE(chosen, c.allowed_scopes[1]))
      ON CONFLICT (role, permission_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO public.system_owners(user_id)
SELECT user_id FROM public.user_roles WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- ============ resolution functions ============
CREATE OR REPLACE FUNCTION public.is_system_owner(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.system_owners WHERE user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.perm_role_of(_user uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user LIMIT 1;
$$;

-- Quyền bất biến của system owner: luôn quản trị được phân quyền.
CREATE OR REPLACE FUNCTION public.perm_invariant_keys()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['permissions.manage','roles.view','audit.view'];
$$;

CREATE OR REPLACE FUNCTION public.perm_effective(_user uuid)
RETURNS TABLE(permission_key text, enabled boolean, data_scope text, source text, locked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (SELECT public.perm_role_of(_user) AS role),
  owner AS (SELECT public.is_system_owner(_user) AS is_owner)
  SELECT
    c.permission_key,
    CASE
      WHEN (SELECT is_owner FROM owner) AND c.permission_key = ANY(public.perm_invariant_keys()) THEN true
      WHEN o.override_type = 'deny' THEN false
      WHEN o.override_type = 'allow' THEN true
      ELSE COALESCE(rp.enabled, false)
    END AS enabled,
    COALESCE(
      CASE WHEN (SELECT is_owner FROM owner) AND c.permission_key = ANY(public.perm_invariant_keys()) THEN 'organization' END,
      o.data_scope, rp.data_scope, 'own') AS data_scope,
    CASE
      WHEN (SELECT is_owner FROM owner) AND c.permission_key = ANY(public.perm_invariant_keys()) THEN 'system_owner'
      WHEN o.override_type IS NOT NULL THEN 'user_override'
      WHEN rp.permission_key IS NOT NULL THEN 'role'
      ELSE 'default_deny' END AS source,
    ((SELECT is_owner FROM owner) AND c.permission_key = ANY(public.perm_invariant_keys())) AS locked
  FROM public.permission_catalog c
  LEFT JOIN public.role_permission_config rp
    ON rp.permission_key = c.permission_key AND rp.role = (SELECT role FROM r)
  LEFT JOIN public.user_permission_overrides o
    ON o.permission_key = c.permission_key AND o.user_id = _user;
$$;

CREATE OR REPLACE FUNCTION public.has_perm(_user uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT enabled FROM public.perm_effective(_user) WHERE permission_key = _key), false);
$$;

CREATE OR REPLACE FUNCTION public.perm_scope(_user uuid, _key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN enabled THEN data_scope ELSE NULL END FROM public.perm_effective(_user) WHERE permission_key = _key),
    'none');
$$;

CREATE OR REPLACE FUNCTION public.perm_effective_for(_user uuid)
RETURNS TABLE(permission_key text, enabled boolean, data_scope text, source text, locked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.perm_effective(_user)
  WHERE _user = auth.uid()
     OR public.has_perm(auth.uid(),'permissions.manage')
     OR public.is_system_owner(auth.uid());
$$;

-- ============ scope-aware visibility ============
CREATE OR REPLACE FUNCTION public.can_view_project(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT public.perm_scope(auth.uid(),'projects.view') AS scope)
  SELECT CASE (SELECT scope FROM s)
    WHEN 'none' THEN false
    WHEN 'organization' THEN true
    ELSE
      EXISTS (SELECT 1 FROM public.projects p
              WHERE p.id = _project AND (p.created_by = auth.uid() OR p.owner_id = auth.uid()))
      OR ((SELECT scope FROM s) <> 'own' AND (
        EXISTS (SELECT 1 FROM public.project_members pm
                WHERE pm.project_id = _project AND pm.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.project_teams pt
                   WHERE pt.project_id = _project AND pt.team_id IN (SELECT public.my_team_ids()))
        OR EXISTS (SELECT 1 FROM public.projects p
                   WHERE p.id = _project AND p.responsible_team_id IS NOT NULL
                     AND p.responsible_team_id = public.leader_team_id(auth.uid()))
        OR EXISTS (SELECT 1 FROM public.projects p JOIN public.profiles c ON c.id = p.created_by
                   WHERE p.id = _project AND p.status = 'leader_review'
                     AND c.primary_team_id IS NOT NULL
                     AND c.primary_team_id = public.leader_team_id(auth.uid()))))
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_task(_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT public.perm_scope(auth.uid(),'tasks.view') AS scope)
  SELECT NOT EXISTS (
           SELECT 1 FROM public.tasks t JOIN public.projects p ON p.id = t.project_id
           WHERE t.id = _task AND p.deleted_at IS NOT NULL
         )
     AND CASE (SELECT scope FROM s)
       WHEN 'none' THEN false
       WHEN 'organization' THEN true
       ELSE EXISTS (
         SELECT 1 FROM public.tasks t
         WHERE t.id = _task
           AND (
             t.created_by = auth.uid()
             OR t.assignee_id = auth.uid()
             OR ((SELECT scope FROM s) <> 'own' AND EXISTS (
                   SELECT 1 FROM public.task_participants tp
                   WHERE tp.task_id = t.id AND tp.user_id = auth.uid()))
             OR ((SELECT scope FROM s) IN ('team','related_projects') AND t.team_id IS NOT NULL
                 AND (t.team_id IN (SELECT public.my_team_ids()) OR t.team_id = public.leader_team_id(auth.uid())))
             OR ((SELECT scope FROM s) IN ('team','related_projects') AND t.project_id IS NOT NULL
                 AND public.can_view_project(t.project_id))
           )
       )
     END;
$$;

-- ============ mutation functions ============
CREATE OR REPLACE FUNCTION public.perm_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'roles', COALESCE((SELECT jsonb_agg(jsonb_build_object('role',role,'permission_key',permission_key,'enabled',enabled,'data_scope',data_scope) ORDER BY role, permission_key) FROM public.role_permission_config), '[]'::jsonb),
    'overrides', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'permission_key',permission_key,'override_type',override_type,'data_scope',data_scope,'reason',reason) ORDER BY user_id, permission_key) FROM public.user_permission_overrides), '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.perm_guard_caller()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập.'; END IF;
  IF NOT (public.has_perm(auth.uid(),'permissions.manage') OR public.is_system_owner(auth.uid())) THEN
    RAISE EXCEPTION 'Bạn không có quyền quản lý phân quyền.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.perm_assert_no_lockout()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.profiles p
  WHERE p.status = 'active' AND public.has_perm(p.id,'permissions.manage');
  IF n = 0 THEN
    RAISE EXCEPTION 'Cấu hình bị từ chối: sẽ không còn tài khoản hoạt động nào quản lý được phân quyền.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.system_owners) THEN
    RAISE EXCEPTION 'Cấu hình bị từ chối: phải còn ít nhất một chủ hệ thống.';
  END IF;
END $$;

-- changes: [{scope:'role', role, permission_key, enabled, data_scope}
--           {scope:'user', user_id, permission_key, override_type|null, data_scope, reason}]
CREATE OR REPLACE FUNCTION public.perm_apply_changes(_changes jsonb, _reason text, _kind text DEFAULT 'update')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ch jsonb;
  before_snap jsonb;
  after_snap jsonb;
  cs_id uuid;
  caller uuid := auth.uid();
  caller_role public.app_role;
  is_owner boolean;
  was_enabled boolean;
BEGIN
  PERFORM public.perm_guard_caller();
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Vui lòng nhập lý do thay đổi (tối thiểu 5 ký tự).';
  END IF;
  IF jsonb_array_length(COALESCE(_changes,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Không có thay đổi nào để lưu.';
  END IF;
  caller_role := public.perm_role_of(caller);
  is_owner := public.is_system_owner(caller);
  before_snap := public.perm_snapshot();

  FOR ch IN SELECT * FROM jsonb_array_elements(_changes) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.permission_catalog c
                   WHERE c.permission_key = ch->>'permission_key' AND c.is_configurable) THEN
      RAISE EXCEPTION 'Quyền % không tồn tại hoặc không được phép cấu hình.', ch->>'permission_key';
    END IF;

    IF ch->>'scope' = 'role' THEN
      IF (ch->>'data_scope') IS NOT NULL AND NOT ((ch->>'data_scope') = ANY (
          SELECT unnest(allowed_scopes) FROM public.permission_catalog WHERE permission_key = ch->>'permission_key')) THEN
        RAISE EXCEPTION 'Phạm vi % không hợp lệ cho quyền %.', ch->>'data_scope', ch->>'permission_key';
      END IF;
      SELECT enabled INTO was_enabled FROM public.role_permission_config
        WHERE role = (ch->>'role')::public.app_role AND permission_key = ch->>'permission_key';
      IF NOT is_owner AND (ch->>'role')::public.app_role = caller_role
         AND COALESCE((ch->>'enabled')::boolean,false) AND NOT COALESCE(was_enabled,false) THEN
        RAISE EXCEPTION 'Bạn không thể tự nâng quyền cho vai trò của chính mình.';
      END IF;
      INSERT INTO public.role_permission_config(role, permission_key, enabled, data_scope, updated_by, updated_at)
      VALUES ((ch->>'role')::public.app_role, ch->>'permission_key',
              COALESCE((ch->>'enabled')::boolean,false),
              COALESCE(ch->>'data_scope','organization'), caller, now())
      ON CONFLICT (role, permission_key) DO UPDATE
        SET enabled = EXCLUDED.enabled, data_scope = EXCLUDED.data_scope,
            updated_by = caller, updated_at = now();

    ELSIF ch->>'scope' = 'user' THEN
      IF (ch->>'user_id')::uuid = caller AND NOT is_owner THEN
        RAISE EXCEPTION 'Bạn không thể tự cấu hình ngoại lệ quyền cho chính mình.';
      END IF;
      IF (ch->>'override_type') IS NULL OR ch->>'override_type' = 'inherit' THEN
        DELETE FROM public.user_permission_overrides
          WHERE user_id = (ch->>'user_id')::uuid AND permission_key = ch->>'permission_key';
      ELSE
        IF length(btrim(COALESCE(ch->>'reason', _reason))) < 5 THEN
          RAISE EXCEPTION 'Ngoại lệ cá nhân cần lý do.';
        END IF;
        INSERT INTO public.user_permission_overrides(user_id, permission_key, override_type, data_scope, reason, created_by, updated_at)
        VALUES ((ch->>'user_id')::uuid, ch->>'permission_key', ch->>'override_type',
                NULLIF(ch->>'data_scope',''), COALESCE(ch->>'reason', _reason), caller, now())
        ON CONFLICT (user_id, permission_key) DO UPDATE
          SET override_type = EXCLUDED.override_type, data_scope = EXCLUDED.data_scope,
              reason = EXCLUDED.reason, created_by = caller, updated_at = now();
      END IF;
    ELSE
      RAISE EXCEPTION 'Loại thay đổi không hợp lệ.';
    END IF;
  END LOOP;

  PERFORM public.perm_assert_no_lockout();
  after_snap := public.perm_snapshot();

  INSERT INTO public.permission_change_sets(reason, kind, changes_json, before_snapshot, after_snapshot, created_by)
  VALUES (_reason, _kind, _changes, before_snap, after_snap, caller)
  RETURNING id INTO cs_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (caller, 'permission_change', 'permission_change_set', cs_id,
          jsonb_build_object('reason', _reason, 'kind', _kind, 'change_count', jsonb_array_length(_changes)));
  RETURN cs_id;
END $$;

CREATE OR REPLACE FUNCTION public.perm_restore_snapshot(_snapshot jsonb, _reason text, _kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before_snap jsonb; cs_id uuid; caller uuid := auth.uid();
BEGIN
  PERFORM public.perm_guard_caller();
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Vui lòng nhập lý do (tối thiểu 5 ký tự).';
  END IF;
  before_snap := public.perm_snapshot();

  DELETE FROM public.role_permission_config;
  INSERT INTO public.role_permission_config(role, permission_key, enabled, data_scope, updated_by, updated_at)
  SELECT (x->>'role')::public.app_role, x->>'permission_key', (x->>'enabled')::boolean,
         COALESCE(x->>'data_scope','organization'), caller, now()
  FROM jsonb_array_elements(COALESCE(_snapshot->'roles','[]'::jsonb)) x
  WHERE EXISTS (SELECT 1 FROM public.permission_catalog c WHERE c.permission_key = x->>'permission_key');

  DELETE FROM public.user_permission_overrides;
  INSERT INTO public.user_permission_overrides(user_id, permission_key, override_type, data_scope, reason, created_by, updated_at)
  SELECT (x->>'user_id')::uuid, x->>'permission_key', x->>'override_type', NULLIF(x->>'data_scope',''),
         COALESCE(x->>'reason','Khôi phục cấu hình'), caller, now()
  FROM jsonb_array_elements(COALESCE(_snapshot->'overrides','[]'::jsonb)) x
  WHERE EXISTS (SELECT 1 FROM public.permission_catalog c WHERE c.permission_key = x->>'permission_key')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (x->>'user_id')::uuid);

  PERFORM public.perm_assert_no_lockout();

  INSERT INTO public.permission_change_sets(reason, kind, changes_json, before_snapshot, after_snapshot, created_by)
  VALUES (_reason, _kind, '[]'::jsonb, before_snap, public.perm_snapshot(), caller)
  RETURNING id INTO cs_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (caller, 'permission_change', 'permission_change_set', cs_id,
          jsonb_build_object('reason', _reason, 'kind', _kind));
  RETURN cs_id;
END $$;

CREATE OR REPLACE FUNCTION public.perm_revert_change_set(_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE snap jsonb; new_id uuid;
BEGIN
  PERFORM public.perm_guard_caller();
  SELECT before_snapshot INTO snap FROM public.permission_change_sets WHERE id = _id;
  IF snap IS NULL THEN RAISE EXCEPTION 'Không tìm thấy thay đổi cần hoàn tác.'; END IF;
  new_id := public.perm_restore_snapshot(snap, _reason, 'revert');
  UPDATE public.permission_change_sets SET reverted_at = now(), reverted_by = auth.uid() WHERE id = _id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.perm_clear_user_overrides(_user uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changes jsonb;
BEGIN
  PERFORM public.perm_guard_caller();
  SELECT COALESCE(jsonb_agg(jsonb_build_object('scope','user','user_id',_user,'permission_key',permission_key,'override_type',NULL)), '[]'::jsonb)
    INTO changes FROM public.user_permission_overrides WHERE user_id = _user;
  IF jsonb_array_length(changes) = 0 THEN RAISE EXCEPTION 'Người dùng này không có ngoại lệ nào.'; END IF;
  RETURN public.perm_apply_changes(changes, _reason, 'clear_overrides');
END $$;

REVOKE EXECUTE ON FUNCTION public.perm_snapshot(), public.perm_guard_caller(), public.perm_assert_no_lockout(),
  public.perm_restore_snapshot(jsonb, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_system_owner(uuid), public.perm_role_of(uuid), public.perm_invariant_keys(),
  public.perm_effective(uuid), public.perm_effective_for(uuid), public.has_perm(uuid, text), public.perm_scope(uuid, text),
  public.perm_apply_changes(jsonb, text, text), public.perm_revert_change_set(uuid, text),
  public.perm_clear_user_overrides(uuid, text) TO authenticated;