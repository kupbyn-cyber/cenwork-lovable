-- 1) Helper dùng chung: quản trị toàn hệ thống = admin hoặc cmo
CREATE OR REPLACE FUNCTION public.is_system_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'cmo');
$$;
REVOKE ALL ON FUNCTION public.is_system_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_system_admin(uuid) TO authenticated, service_role;

-- 2) MVP admin
CREATE OR REPLACE FUNCTION public.is_mvp_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_system_admin(auth.uid());
$$;

-- 3) Xóa mềm: Admin hoặc CMO
CREATE OR REPLACE FUNCTION public.soft_delete_entity(_entity_type text, _entity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _name text; _already timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF NOT public.is_system_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Admin hoặc CMO được xóa dữ liệu';
  END IF;
  IF _entity_type NOT IN ('task','project') THEN RAISE EXCEPTION 'Loại đối tượng không hợp lệ'; END IF;

  IF _entity_type = 'task' THEN
    SELECT name, deleted_at INTO _name, _already FROM public.tasks WHERE id = _entity_id;
    IF _name IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
    IF _already IS NOT NULL THEN RETURN; END IF;
    UPDATE public.tasks SET deleted_at = now(), deleted_by = auth.uid() WHERE id = _entity_id;
  ELSE
    SELECT name, deleted_at INTO _name, _already FROM public.projects WHERE id = _entity_id;
    IF _name IS NULL THEN RAISE EXCEPTION 'Không tìm thấy dự án'; END IF;
    IF _already IS NOT NULL THEN RETURN; END IF;
    UPDATE public.projects SET deleted_at = now(), deleted_by = auth.uid() WHERE id = _entity_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, actor_email, action, entity_type, entity_id, after_data, result, metadata)
  VALUES (
    auth.uid(),
    (SELECT email FROM public.profiles WHERE id = auth.uid()),
    _entity_type || '.soft_delete',
    _entity_type,
    _entity_id,
    jsonb_build_object('name', _name, 'deleted_at', now()),
    'success',
    '{}'::jsonb
  );
END;
$function$;

-- 4) Hồ sơ: Admin hoặc CMO được đổi trạng thái tài khoản
CREATE OR REPLACE FUNCTION public.enforce_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- thao tác từ backend tin cậy
  END IF;
  IF NEW.id <> OLD.id OR lower(NEW.email) <> lower(OLD.email) THEN
    RAISE EXCEPTION 'Không được đổi định danh hoặc email của tài khoản';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT public.is_system_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Admin hoặc CMO được đổi trạng thái tài khoản';
  END IF;
  IF NEW.primary_team_id IS DISTINCT FROM OLD.primary_team_id
     AND NOT public.is_system_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Admin hoặc CMO được đổi Team chính';
  END IF;
  RETURN NEW;
END; $function$;

-- 5) Duyệt dự án: CMO ngang Admin ở mọi bước
CREATE OR REPLACE FUNCTION public.project_decide(_project uuid, _approve boolean, _reason text DEFAULT NULL::text)
RETURNS project_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _p public.projects;
  _role public.app_role := public.current_app_role();
  _is_sysadmin boolean := public.is_system_admin(auth.uid());
  _stage text;
  _next public.project_status;
  _team uuid;
BEGIN
  SELECT * INTO _p FROM public.projects WHERE id = _project AND deleted_at IS NULL FOR UPDATE;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy dự án'; END IF;

  IF _p.status = 'leader_review' THEN
    _stage := 'leader';
    _team := coalesce(_p.responsible_team_id,
                      (SELECT primary_team_id FROM public.profiles WHERE id = _p.created_by));
    IF NOT (_is_sysadmin OR (_team IS NOT NULL AND _team = public.leader_team_id(auth.uid()))) THEN
      RAISE EXCEPTION 'Chỉ Leader của Team phụ trách được duyệt bước này';
    END IF;
    _next := CASE WHEN _approve THEN 'proposal'::public.project_status ELSE 'rejected'::public.project_status END;
  ELSIF _p.status = 'proposal' THEN
    _stage := 'cmo';
    IF NOT _is_sysadmin THEN
      RAISE EXCEPTION 'Chỉ Admin hoặc CMO được duyệt bước này';
    END IF;
    _next := CASE WHEN _approve THEN 'planning'::public.project_status ELSE 'rejected'::public.project_status END;
  ELSE
    RAISE EXCEPTION 'Dự án không ở trạng thái chờ duyệt';
  END IF;

  IF NOT _approve AND coalesce(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'Phải nhập lý do từ chối';
  END IF;

  PERFORM set_config('cen.project_workflow','1',true);
  UPDATE public.projects SET
    status = _next,
    approved_at = CASE WHEN _next = 'planning' THEN now() ELSE NULL END,
    approved_by = CASE WHEN _next = 'planning' THEN auth.uid() ELSE NULL END,
    rejected_at = CASE WHEN _next = 'rejected' THEN now() ELSE NULL END,
    rejected_by = CASE WHEN _next = 'rejected' THEN auth.uid() ELSE NULL END,
    rejection_reason = CASE WHEN _next = 'rejected' THEN btrim(_reason) ELSE NULL END,
    last_decision_note = CASE WHEN _next = 'rejected' THEN btrim(_reason) ELSE _p.last_decision_note END,
    owner_id = CASE WHEN _next = 'planning' AND _p.owner_id IS NULL THEN _p.created_by ELSE _p.owner_id END
  WHERE id = _project;
  PERFORM set_config('cen.project_workflow','',true);

  INSERT INTO public.project_approvals(project_id, round, stage, action, actor_id, actor_role, from_status, to_status, reason)
  VALUES (_project, greatest(_p.approval_round,1), _stage,
          CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
          auth.uid(), _role, _p.status, _next, CASE WHEN _approve THEN NULL ELSE btrim(_reason) END);

  RETURN _next;
END; $function$;

-- 6) RLS: thay các policy chỉ dành cho Admin bằng quản trị toàn hệ thống
DROP POLICY IF EXISTS app_settings_select_admin ON public.app_settings;
CREATE POLICY app_settings_select_admin ON public.app_settings
  FOR SELECT TO authenticated USING (public.is_system_admin(auth.uid()));
DROP POLICY IF EXISTS app_settings_insert_admin ON public.app_settings;
CREATE POLICY app_settings_insert_admin ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_system_admin(auth.uid()));
DROP POLICY IF EXISTS app_settings_update_admin ON public.app_settings;
CREATE POLICY app_settings_update_admin ON public.app_settings
  FOR UPDATE TO authenticated USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS facilities_insert_admin ON public.facilities;
CREATE POLICY facilities_insert_admin ON public.facilities
  FOR INSERT TO authenticated WITH CHECK (public.is_system_admin(auth.uid()));
DROP POLICY IF EXISTS facilities_update_admin ON public.facilities;
CREATE POLICY facilities_update_admin ON public.facilities
  FOR UPDATE TO authenticated USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS teams_insert_admin ON public.teams;
CREATE POLICY teams_insert_admin ON public.teams
  FOR INSERT TO authenticated WITH CHECK (public.is_system_admin(auth.uid()));
DROP POLICY IF EXISTS teams_update_admin ON public.teams;
CREATE POLICY teams_update_admin ON public.teams
  FOR UPDATE TO authenticated USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS mvp_votes_select_own ON public.mvp_votes;
CREATE POLICY mvp_votes_select_own ON public.mvp_votes
  FOR SELECT TO authenticated
  USING (voter_id = auth.uid() OR public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS tg_outbox_admin_select ON public.telegram_outbox;
CREATE POLICY tg_outbox_admin_select ON public.telegram_outbox
  FOR SELECT TO authenticated USING (public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS tg_team_links_admin_all ON public.telegram_team_links;
CREATE POLICY tg_team_links_admin_all ON public.telegram_team_links
  FOR ALL TO authenticated USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS tg_user_links_admin_all ON public.telegram_user_links;
CREATE POLICY tg_user_links_admin_all ON public.telegram_user_links
  FOR ALL TO authenticated USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

-- 7) Ràng buộc Team theo vai trò: Leader/Member bắt buộc có Team chính
CREATE OR REPLACE FUNCTION public.enforce_role_team_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _role public.app_role; _team uuid;
BEGIN
  IF TG_TABLE_NAME = 'user_roles' THEN
    _role := NEW.role;
    SELECT primary_team_id INTO _team FROM public.profiles WHERE id = NEW.user_id;
  ELSE
    SELECT role INTO _role FROM public.user_roles WHERE user_id = NEW.id LIMIT 1;
    _team := NEW.primary_team_id;
  END IF;

  IF _role IN ('leader','member') AND _team IS NULL THEN
    RAISE EXCEPTION 'Tài khoản Leader hoặc Member phải thuộc một Team chính';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_user_roles_team_requirement ON public.user_roles;
CREATE TRIGGER trg_user_roles_team_requirement
  AFTER INSERT OR UPDATE OF role ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_team_requirement();

DROP TRIGGER IF EXISTS trg_profiles_team_requirement ON public.profiles;
CREATE TRIGGER trg_profiles_team_requirement
  AFTER UPDATE OF primary_team_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_team_requirement();