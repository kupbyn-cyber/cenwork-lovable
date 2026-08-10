-- 1. Cột mới cho projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS responsible_team_id uuid REFERENCES public.teams(id),
  ADD COLUMN IF NOT EXISTS creator_role_snapshot public.app_role,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approval_round integer NOT NULL DEFAULT 0;

-- 2. Lịch sử phê duyệt
CREATE TABLE IF NOT EXISTS public.project_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  round integer NOT NULL DEFAULT 1,
  stage text NOT NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  actor_role public.app_role,
  from_status public.project_status,
  to_status public.project_status,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_approvals_project_idx
  ON public.project_approvals(project_id, created_at DESC);

GRANT SELECT ON public.project_approvals TO authenticated;
GRANT ALL ON public.project_approvals TO service_role;
ALTER TABLE public.project_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_approvals_select" ON public.project_approvals;
CREATE POLICY "project_approvals_select" ON public.project_approvals
  FOR SELECT TO authenticated
  USING (public.can_view_project(project_id));

-- 3. Xem dự án: Leader của Team phụ trách
CREATE OR REPLACE FUNCTION public.can_view_project(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND (p.created_by = auth.uid() OR p.owner_id = auth.uid()))
      OR EXISTS (SELECT 1 FROM public.project_members pm
                 WHERE pm.project_id = _project AND pm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.project_teams pt
                 WHERE pt.project_id = _project AND pt.team_id IN (SELECT public.my_team_ids()))
      OR EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND p.responsible_team_id IS NOT NULL
                   AND p.responsible_team_id = public.leader_team_id(auth.uid()))
      OR EXISTS (SELECT 1 FROM public.projects p JOIN public.profiles c ON c.id = p.created_by
                 WHERE p.id = _project AND p.status = 'leader_review'
                   AND c.primary_team_id IS NOT NULL
                   AND c.primary_team_id = public.leader_team_id(auth.uid()));
$function$;

-- 4. Sửa nội dung: người tạo được sửa khi nháp hoặc bị từ chối
CREATE OR REPLACE FUNCTION public.can_edit_project_row(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT public.can_manage_project(_project)
      OR EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND p.created_by = auth.uid()
                   AND p.status IN ('idea','rejected'))
      OR EXISTS (SELECT 1 FROM public.projects p JOIN public.profiles c ON c.id = p.created_by
                 WHERE p.id = _project AND p.status = 'leader_review'
                   AND c.primary_team_id IS NOT NULL
                   AND c.primary_team_id = public.leader_team_id(auth.uid()));
$function$;

-- 5. Dự án đã duyệt
CREATE OR REPLACE FUNCTION public.is_project_approved(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project
                   AND p.status NOT IN ('idea','leader_review','proposal','rejected'));
$function$;
REVOKE EXECUTE ON FUNCTION public.is_project_approved(uuid) FROM anon;

-- 6. Không tạo Task cho dự án chưa duyệt
CREATE OR REPLACE FUNCTION public.can_create_task(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _project IS NULL THEN public.current_app_role() IS NOT NULL
    WHEN NOT public.is_project_approved(_project) THEN false
    ELSE public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR public.can_manage_project(_project)
      OR (public.leader_team_id(auth.uid()) IS NOT NULL AND public.can_view_project(_project))
  END;
$function$;

-- 7. Validate: cho phép RPC workflow, khóa sửa khi đang chờ duyệt
CREATE OR REPLACE FUNCTION public.validate_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _is_admin boolean := public.has_role(auth.uid(),'admin');
  _is_cmo boolean := public.has_role(auth.uid(),'cmo');
  _is_creator boolean := NEW.created_by = auth.uid();
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.manually_archived_at IS DISTINCT FROM OLD.manually_archived_at THEN
    IF NOT (_is_admin OR _is_cmo) THEN
      RAISE EXCEPTION 'Chỉ Admin hoặc CMO được lưu trữ hoặc khôi phục thủ công';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.deadline IS DISTINCT FROM OLD.deadline
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'Lưu trữ thủ công không được thay đổi dữ liệu nghiệp vụ';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.deadline IS NOT NULL AND NEW.start_date IS NOT NULL AND NEW.deadline < NEW.start_date THEN
    RAISE EXCEPTION 'Deadline không được trước ngày bắt đầu';
  END IF;

  IF NEW.owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = NEW.owner_id AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Project Owner phải là nhân sự đang hoạt động';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'idea' THEN RAISE EXCEPTION 'Dự án mới phải bắt đầu ở trạng thái Bản nháp'; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Không được đổi định danh hoặc người tạo dự án';
  END IF;

  -- Chuyển trạng thái phê duyệt chỉ đi qua hàm nghiệp vụ (đã kiểm tra quyền bên trong)
  IF coalesce(current_setting('cen.project_workflow', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    IF OLD.status IN ('idea','rejected') THEN
      IF NOT (_is_creator OR _is_admin) THEN RAISE EXCEPTION 'Chỉ người tạo dự án được chỉnh sửa'; END IF;
    ELSIF OLD.status IN ('leader_review','proposal') THEN
      IF NOT (_is_admin OR _is_cmo) THEN RAISE EXCEPTION 'Dự án đang chờ duyệt, không thể chỉnh sửa'; END IF;
    ELSIF OLD.status = 'archived' THEN
      IF NOT _is_admin THEN RAISE EXCEPTION 'Dự án đã lưu trữ, không thể chỉnh sửa'; END IF;
    ELSE
      IF NOT (_is_admin OR _is_cmo OR OLD.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Chỉ CMO hoặc Project Owner được cập nhật dự án';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'archived' THEN
    IF NOT (_is_admin OR _is_cmo OR OLD.owner_id = auth.uid()) THEN
      RAISE EXCEPTION 'Chỉ CMO, Admin hoặc Project Owner được lưu trữ dự án';
    END IF;
    RETURN NEW;
  END IF;

  IF (OLD.status,NEW.status) IN (
      ('planning','in_progress'),('in_progress','pending_acceptance'),
      ('pending_acceptance','completed'),('pending_acceptance','in_progress')
  ) THEN
    IF NOT (_is_admin OR _is_cmo OR OLD.owner_id = auth.uid()) THEN
      RAISE EXCEPTION 'Chỉ CMO, Admin hoặc Project Owner được chuyển trạng thái dự án';
    END IF;
  ELSE
    RAISE EXCEPTION 'Không thể chuyển trạng thái từ % sang %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END; $function$;

-- 8. Gửi duyệt
CREATE OR REPLACE FUNCTION public.project_submit(_project uuid)
RETURNS public.project_status LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _p public.projects;
  _role public.app_role := public.current_app_role();
  _is_admin boolean := public.has_role(auth.uid(),'admin');
  _next public.project_status;
  _leader uuid;
  _round integer;
BEGIN
  SELECT * INTO _p FROM public.projects WHERE id = _project AND deleted_at IS NULL FOR UPDATE;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy dự án'; END IF;
  IF NOT (_p.created_by = auth.uid() OR _is_admin) THEN
    RAISE EXCEPTION 'Chỉ người tạo dự án được gửi duyệt';
  END IF;
  IF _p.status NOT IN ('idea','rejected') THEN
    RAISE EXCEPTION 'Dự án không ở trạng thái có thể gửi duyệt';
  END IF;
  IF coalesce(btrim(_p.name),'') = '' OR coalesce(btrim(_p.objective),'') = '' THEN
    RAISE EXCEPTION 'Dự án phải có tên và mục tiêu trước khi gửi duyệt';
  END IF;

  _round := _p.approval_round + 1;

  IF _role IN ('admin','cmo') THEN
    _next := 'planning';
  ELSIF _role = 'leader' THEN
    _next := 'proposal';
  ELSE
    IF _p.responsible_team_id IS NULL THEN
      RAISE EXCEPTION 'Bạn phải chọn Team phụ trách trước khi gửi duyệt';
    END IF;
    SELECT leader_id INTO _leader FROM public.teams WHERE id = _p.responsible_team_id;
    IF _leader IS NULL THEN
      RAISE EXCEPTION 'Team phụ trách chưa có Leader, vui lòng chọn Team khác';
    END IF;
    _next := 'leader_review';
  END IF;

  PERFORM set_config('cen.project_workflow','1',true);
  UPDATE public.projects SET
    status = _next,
    creator_role_snapshot = coalesce(_p.creator_role_snapshot, _role),
    approval_round = _round,
    submitted_at = now(),
    rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL,
    approved_at = CASE WHEN _next = 'planning' THEN now() ELSE NULL END,
    approved_by = CASE WHEN _next = 'planning' THEN auth.uid() ELSE NULL END,
    owner_id = CASE WHEN _next = 'planning' AND _p.owner_id IS NULL THEN _p.created_by ELSE _p.owner_id END
  WHERE id = _project;
  PERFORM set_config('cen.project_workflow','',true);

  INSERT INTO public.project_approvals(project_id, round, stage, action, actor_id, actor_role, from_status, to_status)
  VALUES (_project, _round,
          CASE WHEN _next = 'planning' THEN 'auto' WHEN _next = 'proposal' THEN 'cmo' ELSE 'leader' END,
          CASE WHEN _next = 'planning' THEN 'auto_approved' ELSE 'submitted' END,
          auth.uid(), _role, _p.status, _next);

  RETURN _next;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.project_submit(uuid) FROM anon;

-- 9. Quyết định duyệt / từ chối
CREATE OR REPLACE FUNCTION public.project_decide(_project uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS public.project_status LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _p public.projects;
  _role public.app_role := public.current_app_role();
  _is_admin boolean := public.has_role(auth.uid(),'admin');
  _is_cmo boolean := public.has_role(auth.uid(),'cmo');
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
    IF NOT (_is_admin OR (_team IS NOT NULL AND _team = public.leader_team_id(auth.uid()))) THEN
      RAISE EXCEPTION 'Chỉ Leader của Team phụ trách được duyệt bước này';
    END IF;
    _next := CASE WHEN _approve THEN 'proposal'::public.project_status ELSE 'rejected'::public.project_status END;
  ELSIF _p.status = 'proposal' THEN
    _stage := 'cmo';
    IF NOT (_is_admin OR _is_cmo) THEN
      RAISE EXCEPTION 'Chỉ CMO được duyệt bước này';
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
REVOKE EXECUTE ON FUNCTION public.project_decide(uuid, boolean, text) FROM anon;

-- 10. Thông báo theo luồng mới
CREATE OR REPLACE FUNCTION public.notify_project_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _link text; _title text; _body text; _key text; _event text;
        _leader uuid; _r uuid; _team uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  _link := '/projects/' || NEW.id::text;
  _key := 'project.decision:' || NEW.id::text || ':' || NEW.approval_round::text
          || ':' || OLD.status::text || '->' || NEW.status::text;
  _team := coalesce(NEW.responsible_team_id,
                    (SELECT primary_team_id FROM public.profiles WHERE id = NEW.created_by));
  SELECT leader_id INTO _leader FROM public.teams WHERE id = _team;

  IF NEW.status = 'leader_review' THEN
    PERFORM public.notify_user(_leader, 'project.pending_approval', 'Dự án chờ bạn duyệt',
      NEW.name, 'project', NEW.id, _link, _key);
    RETURN NEW;
  END IF;

  IF NEW.status = 'proposal' THEN
    FOR _r IN SELECT user_id FROM public.user_roles WHERE role = 'cmo' LOOP
      PERFORM public.notify_user(_r, 'project.pending_approval', 'Dự án chờ CMO duyệt',
        NEW.name, 'project', NEW.id, _link, _key || ':' || _r::text);
    END LOOP;
    IF OLD.status = 'leader_review' THEN
      PERFORM public.notify_user(NEW.created_by, 'project.approved', 'Dự án đã được Leader duyệt',
        NEW.name, 'project', NEW.id, _link, _key || ':creator');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'planning' AND OLD.status IN ('idea','proposal','rejected') THEN
    _title := 'Dự án đã được duyệt'; _body := NEW.name; _event := 'project.approved';
  ELSIF NEW.status = 'rejected' THEN
    _title := 'Dự án bị từ chối';
    _body := NEW.name || CASE WHEN coalesce(btrim(NEW.rejection_reason),'') = '' THEN ''
                              ELSE ' — ' || NEW.rejection_reason END;
    _event := 'project.rejected';
  ELSE
    RETURN NEW;
  END IF;

  FOREACH _r IN ARRAY ARRAY[NEW.created_by, NEW.owner_id, _leader] LOOP
    PERFORM public.notify_user(_r, _event, _title, _body, 'project', NEW.id, _link,
      _key || ':' || coalesce(_r::text,'none'));
  END LOOP;
  RETURN NEW;
END; $function$;

-- 11. Audit theo luồng mới
CREATE OR REPLACE FUNCTION public.audit_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('project.created','project',NEW.id,NULL,
      jsonb_build_object('name',NEW.name,'status',NEW.status));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit(
      CASE
        WHEN NEW.status IN ('leader_review','proposal') AND OLD.status IN ('idea','rejected') THEN 'project.submitted'
        WHEN OLD.status='leader_review' AND NEW.status='proposal' THEN 'project.leader_approved'
        WHEN OLD.status='leader_review' AND NEW.status='rejected' THEN 'project.leader_rejected'
        WHEN OLD.status='proposal' AND NEW.status='planning' THEN 'project.cmo_approved'
        WHEN OLD.status='proposal' AND NEW.status='rejected' THEN 'project.cmo_rejected'
        WHEN OLD.status='idea' AND NEW.status='planning' THEN 'project.auto_approved'
        WHEN NEW.status='archived' THEN 'project.archived'
        ELSE 'project.status_changed'
      END,
      'project', NEW.id,
      jsonb_build_object('status',OLD.status),
      jsonb_build_object('status',NEW.status,'note',coalesce(NEW.rejection_reason,NEW.last_decision_note)));
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    PERFORM public.write_audit('project.owner_changed','project',NEW.id,
      jsonb_build_object('owner_id',OLD.owner_id), jsonb_build_object('owner_id',NEW.owner_id));
  END IF;

  IF NEW.deadline IS DISTINCT FROM OLD.deadline OR NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    PERFORM public.write_audit('project.schedule_changed','project',NEW.id,
      jsonb_build_object('start_date',OLD.start_date,'deadline',OLD.deadline),
      jsonb_build_object('start_date',NEW.start_date,'deadline',NEW.deadline));
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.objective IS DISTINCT FROM OLD.objective
     OR NEW.description IS DISTINCT FROM OLD.description THEN
    PERFORM public.write_audit('project.updated','project',NEW.id,
      jsonb_build_object('name',OLD.name), jsonb_build_object('name',NEW.name));
  END IF;

  RETURN NEW;
END; $function$;

-- 12. Dữ liệu cũ: ghi nhận mốc duyệt cho dự án đã chính thức
UPDATE public.projects
   SET approved_at = coalesce(approved_at, updated_at),
       approval_round = GREATEST(approval_round, 1)
 WHERE status NOT IN ('idea','leader_review','proposal','rejected')
   AND approved_at IS NULL;