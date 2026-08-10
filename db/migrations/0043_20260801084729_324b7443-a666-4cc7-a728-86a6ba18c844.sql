-- ============================================================
-- 1. Cột mới: completed_at + lưu trữ thủ công
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_archived_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_archived_by uuid REFERENCES public.profiles(id);

-- ============================================================
-- 2. Ghi completed_at theo trạng thái hoàn thành cuối cùng
-- ============================================================
CREATE OR REPLACE FUNCTION public.stamp_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.completed_at := CASE WHEN NEW.status = 'done' THEN now() ELSE NULL END;
    RETURN NEW;
  END IF;
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
  ELSE
    NEW.completed_at := OLD.completed_at;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_stamp_task_completion ON public.tasks;
CREATE TRIGGER trg_stamp_task_completion
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.stamp_task_completion();

CREATE OR REPLACE FUNCTION public.stamp_project_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.completed_at := CASE WHEN NEW.status = 'completed' THEN now() ELSE NULL END;
    RETURN NEW;
  END IF;
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    NEW.completed_at := now();
  ELSIF NEW.status IN ('completed','archived') THEN
    NEW.completed_at := OLD.completed_at;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_stamp_project_completion ON public.projects;
CREATE TRIGGER trg_stamp_project_completion
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.stamp_project_completion();

-- ============================================================
-- 3. Cho phép thao tác lưu trữ thủ công đi qua trigger nghiệp vụ
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _manage boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- Lưu trữ thủ công: chỉ Admin/CMO, không đụng vào dữ liệu nghiệp vụ.
  IF TG_OP = 'UPDATE'
     AND NEW.manually_archived_at IS DISTINCT FROM OLD.manually_archived_at THEN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cmo')) THEN
      RAISE EXCEPTION 'Chỉ Admin hoặc CMO được lưu trữ hoặc khôi phục thủ công';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.deadline IS DISTINCT FROM OLD.deadline
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'Lưu trữ thủ công không được thay đổi dữ liệu nghiệp vụ';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.start_date IS NOT NULL
     AND NEW.deadline < ((NEW.start_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN
    RAISE EXCEPTION 'Deadline không được trước ngày bắt đầu';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = NEW.assignee_id AND p.status = 'active') THEN
    RAISE EXCEPTION 'Người phụ trách phải là nhân sự đang hoạt động';
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.projects p
               WHERE p.id = NEW.project_id AND p.status = 'archived') THEN
      RAISE EXCEPTION 'Dự án đã lưu trữ, không thể gắn công việc';
    END IF;
    IF NOT public.is_in_project_scope(NEW.project_id, NEW.assignee_id) THEN
      RAISE EXCEPTION 'Người phụ trách phải thuộc phạm vi dự án';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by <> auth.uid() THEN
      RAISE EXCEPTION 'Người tạo công việc phải là người dùng hiện tại';
    END IF;
    IF NOT public.can_create_task(NEW.project_id) THEN
      RAISE EXCEPTION 'Bạn không có quyền tạo công việc trong phạm vi này';
    END IF;
    IF NOT public.can_assign_task(NEW.project_id, NEW.team_id, NEW.assignee_id) THEN
      RAISE EXCEPTION 'Bạn không có quyền giao việc cho người này';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Không được đổi định danh hoặc người tạo công việc';
  END IF;

  _manage := public.can_manage_task(OLD.id);

  IF OLD.is_archived AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cmo')) THEN
    RAISE EXCEPTION 'Công việc đã lưu trữ, không thể chỉnh sửa';
  END IF;

  IF NOT _manage THEN
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       OR NEW.team_id IS DISTINCT FROM OLD.team_id
       OR NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      RAISE EXCEPTION 'Bạn chỉ được cập nhật nội dung và tiến độ công việc';
    END IF;
  ELSE
    IF NOT public.can_assign_task(NEW.project_id, NEW.team_id, NEW.assignee_id) THEN
      RAISE EXCEPTION 'Bạn không có quyền giao việc cho người này';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role := public.current_app_role();
  _is_admin boolean := public.has_role(auth.uid(),'admin');
  _is_cmo boolean := public.has_role(auth.uid(),'cmo');
  _is_owner boolean := NEW.owner_id IS NOT NULL AND NEW.owner_id = auth.uid();
  _is_creator boolean := NEW.created_by = auth.uid();
  _is_reviewer boolean := FALSE;
  _team_count int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- Lưu trữ thủ công: chỉ Admin/CMO, không đổi trạng thái nghiệp vụ.
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

  SELECT EXISTS (
    SELECT 1 FROM public.profiles c
    WHERE c.id = NEW.created_by AND c.primary_team_id IS NOT NULL
      AND c.primary_team_id = public.leader_team_id(auth.uid())
  ) INTO _is_reviewer;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'idea' THEN RAISE EXCEPTION 'Dự án mới phải bắt đầu ở trạng thái Ý tưởng'; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Không được đổi định danh hoặc người tạo dự án';
  END IF;

  IF NEW.status = OLD.status THEN
    IF OLD.status = 'idea' THEN
      IF NOT (_is_creator OR _is_admin) THEN RAISE EXCEPTION 'Chỉ người gửi ý tưởng được chỉnh sửa'; END IF;
    ELSIF OLD.status IN ('leader_review','proposal') THEN
      IF NOT (_is_admin OR _is_cmo) THEN RAISE EXCEPTION 'Nội dung đang chờ duyệt, không thể chỉnh sửa'; END IF;
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

  IF OLD.status = 'idea' AND NEW.status = 'leader_review' THEN
    IF NOT (_is_creator OR _is_admin) THEN RAISE EXCEPTION 'Chỉ người gửi được gửi ý tưởng đi duyệt'; END IF;
  ELSIF OLD.status = 'leader_review' AND NEW.status = 'proposal' THEN
    IF NOT (_is_reviewer OR _is_admin) THEN RAISE EXCEPTION 'Chỉ Leader của Team chính người gửi được duyệt ý tưởng'; END IF;
  ELSIF OLD.status = 'leader_review' AND NEW.status = 'idea' THEN
    IF NOT (_is_reviewer OR _is_admin) THEN RAISE EXCEPTION 'Chỉ Leader của Team chính người gửi được từ chối ý tưởng'; END IF;
    IF COALESCE(btrim(NEW.last_decision_note),'') = '' THEN RAISE EXCEPTION 'Phải nhập lý do từ chối'; END IF;
  ELSIF OLD.status = 'proposal' AND NEW.status = 'planning' THEN
    IF NOT (_is_cmo OR _is_admin) THEN RAISE EXCEPTION 'Chỉ CMO được duyệt đề xuất thành dự án chính thức'; END IF;
    IF NEW.owner_id IS NULL THEN RAISE EXCEPTION 'Dự án chính thức phải có Project Owner'; END IF;
    SELECT count(*) INTO _team_count FROM public.project_teams pt WHERE pt.project_id = NEW.id;
    IF _team_count = 0 THEN RAISE EXCEPTION 'Dự án chính thức phải có ít nhất một Team tham gia'; END IF;
    IF NEW.start_date IS NULL OR NEW.deadline IS NULL THEN RAISE EXCEPTION 'Dự án chính thức phải có ngày bắt đầu và deadline'; END IF;
  ELSIF OLD.status = 'proposal' AND NEW.status = 'leader_review' THEN
    IF NOT (_is_cmo OR _is_admin) THEN RAISE EXCEPTION 'Chỉ CMO được từ chối đề xuất'; END IF;
    IF COALESCE(btrim(NEW.last_decision_note),'') = '' THEN RAISE EXCEPTION 'Phải nhập lý do từ chối'; END IF;
  ELSIF (OLD.status,NEW.status) IN (
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

-- ============================================================
-- 4. Bảng yêu cầu đổi deadline
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deadline_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('task','project')),
  entity_id uuid NOT NULL,
  current_deadline timestamptz,
  proposed_deadline timestamptz NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS deadline_change_requests_one_pending
  ON public.deadline_change_requests (entity_type, entity_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS deadline_change_requests_entity_idx
  ON public.deadline_change_requests (entity_type, entity_id, created_at DESC);

GRANT SELECT ON public.deadline_change_requests TO authenticated;
GRANT ALL ON public.deadline_change_requests TO service_role;

ALTER TABLE public.deadline_change_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_deadline_change_requests_updated_at ON public.deadline_change_requests;
CREATE TRIGGER set_deadline_change_requests_updated_at
BEFORE UPDATE ON public.deadline_change_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. Hàm phạm vi quyền cho yêu cầu đổi deadline
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_request_deadline_change(_entity_type text, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _leader uuid := public.leader_team_id(auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _entity_type = 'task' THEN
    RETURN EXISTS (SELECT 1 FROM public.tasks t
                   WHERE t.id = _entity_id AND t.assignee_id = auth.uid())
        OR public.can_approve_deadline_change('task', _entity_id);
  END IF;
  RETURN public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _entity_id AND p.owner_id = auth.uid())
      OR (_leader IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.project_teams pt
            WHERE pt.project_id = _entity_id AND pt.team_id = _leader));
END; $$;

CREATE OR REPLACE FUNCTION public.can_approve_deadline_change(_entity_type text, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _leader uuid := public.leader_team_id(auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cmo') THEN
    RETURN true;
  END IF;
  IF _entity_type = 'project' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    LEFT JOIN public.profiles a ON a.id = t.assignee_id
    WHERE t.id = _entity_id
      AND (
        (p.id IS NOT NULL AND p.owner_id = auth.uid())
        OR (_leader IS NOT NULL AND (t.team_id = _leader OR a.primary_team_id = _leader))
      )
  );
END; $$;

CREATE POLICY "deadline_requests_select_scope"
ON public.deadline_change_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR public.can_request_deadline_change(entity_type, entity_id)
  OR public.can_approve_deadline_change(entity_type, entity_id)
);

-- ============================================================
-- 6. RPC: gửi yêu cầu, duyệt, từ chối
-- ============================================================
CREATE OR REPLACE FUNCTION public.deadline_change_request(
  _entity_type text, _entity_id uuid, _proposed timestamptz, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _current timestamptz; _start date; _id uuid; _name text; _r uuid; _leader uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF _entity_type NOT IN ('task','project') THEN RAISE EXCEPTION 'Loại đối tượng không hợp lệ'; END IF;
  IF NOT public.can_request_deadline_change(_entity_type, _entity_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền gửi yêu cầu đổi deadline cho đối tượng này';
  END IF;
  IF COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Phải nhập lý do đổi deadline'; END IF;
  IF _proposed IS NULL THEN RAISE EXCEPTION 'Phải chọn deadline đề xuất'; END IF;
  IF _proposed <= now() THEN RAISE EXCEPTION 'Deadline đề xuất không được ở quá khứ'; END IF;

  IF _entity_type = 'task' THEN
    SELECT t.deadline, t.start_date, t.name INTO _current, _start, _name
      FROM public.tasks t WHERE t.id = _entity_id;
  ELSE
    SELECT (p.deadline::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',
           p.start_date, p.name
      INTO _current, _start, _name
      FROM public.projects p WHERE p.id = _entity_id;
  END IF;
  IF _name IS NULL THEN RAISE EXCEPTION 'Không tìm thấy đối tượng'; END IF;

  IF _start IS NOT NULL
     AND _proposed < ((_start::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN
    RAISE EXCEPTION 'Deadline đề xuất không được trước ngày bắt đầu';
  END IF;
  IF _current IS NOT NULL AND _proposed = _current THEN
    RAISE EXCEPTION 'Deadline đề xuất trùng với deadline hiện tại';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deadline_change_requests
             WHERE entity_type = _entity_type AND entity_id = _entity_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Đối tượng này đang có một yêu cầu đổi deadline chờ xử lý';
  END IF;

  INSERT INTO public.deadline_change_requests
    (entity_type, entity_id, current_deadline, proposed_deadline, reason, requested_by)
  VALUES (_entity_type, _entity_id, _current, _proposed, btrim(_reason), auth.uid())
  RETURNING id INTO _id;

  PERFORM public.write_audit('deadline.change_requested', _entity_type, _entity_id,
    jsonb_build_object('deadline', _current),
    jsonb_build_object('proposed_deadline', _proposed, 'reason', btrim(_reason), 'request_id', _id),
    '{}'::jsonb);

  -- Thông báo người có thẩm quyền duyệt
  IF _entity_type = 'task' THEN
    FOR _r IN
      SELECT DISTINCT x FROM (
        SELECT p.owner_id AS x FROM public.tasks t
          LEFT JOIN public.projects p ON p.id = t.project_id WHERE t.id = _entity_id
        UNION
        SELECT tm.leader_id FROM public.tasks t
          LEFT JOIN public.teams tm ON tm.id = t.team_id WHERE t.id = _entity_id
        UNION
        SELECT tm2.leader_id FROM public.tasks t
          LEFT JOIN public.profiles a ON a.id = t.assignee_id
          LEFT JOIN public.teams tm2 ON tm2.id = a.primary_team_id WHERE t.id = _entity_id
      ) s WHERE x IS NOT NULL
    LOOP
      PERFORM public.notify_user(_r, 'deadline.change_requested',
        'Yêu cầu đổi deadline công việc', _name, 'task', _entity_id,
        '/tasks/' || _entity_id::text, 'deadline.request:' || _id::text || ':' || _r::text);
    END LOOP;
  ELSE
    FOR _r IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','cmo') LOOP
      PERFORM public.notify_user(_r, 'deadline.change_requested',
        'Yêu cầu đổi deadline dự án', _name, 'project', _entity_id,
        '/projects/' || _entity_id::text, 'deadline.request:' || _id::text || ':' || _r::text);
    END LOOP;
  END IF;

  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.deadline_change_decide(
  _request uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _req public.deadline_change_requests; _name text; _stamp text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

  SELECT * INTO _req FROM public.deadline_change_requests WHERE id = _request FOR UPDATE;
  IF _req.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu'; END IF;
  IF _req.status <> 'pending' THEN RAISE EXCEPTION 'Yêu cầu đã được xử lý'; END IF;
  IF NOT public.can_approve_deadline_change(_req.entity_type, _req.entity_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền xử lý yêu cầu này';
  END IF;
  IF NOT _approve AND COALESCE(btrim(_note),'') = '' THEN
    RAISE EXCEPTION 'Phải nhập lý do từ chối';
  END IF;

  IF _approve THEN
    IF _req.entity_type = 'task' THEN
      UPDATE public.tasks SET deadline = _req.proposed_deadline WHERE id = _req.entity_id
      RETURNING name INTO _name;
    ELSE
      UPDATE public.projects
         SET deadline = (_req.proposed_deadline AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
       WHERE id = _req.entity_id
      RETURNING name INTO _name;
    END IF;
    IF _name IS NULL THEN RAISE EXCEPTION 'Không tìm thấy đối tượng'; END IF;
  ELSE
    SELECT CASE WHEN _req.entity_type = 'task'
      THEN (SELECT name FROM public.tasks WHERE id = _req.entity_id)
      ELSE (SELECT name FROM public.projects WHERE id = _req.entity_id) END INTO _name;
  END IF;

  UPDATE public.deadline_change_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = NULLIF(btrim(COALESCE(_note,'')),'')
   WHERE id = _request;

  PERFORM public.write_audit(
    CASE WHEN _approve THEN 'deadline.change_approved' ELSE 'deadline.change_rejected' END,
    _req.entity_type, _req.entity_id,
    jsonb_build_object('deadline', _req.current_deadline),
    jsonb_build_object('deadline', CASE WHEN _approve THEN _req.proposed_deadline ELSE _req.current_deadline END,
                       'request_id', _request, 'note', NULLIF(btrim(COALESCE(_note,'')),'')),
    '{}'::jsonb);

  _stamp := to_char(_req.proposed_deadline AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI');
  PERFORM public.notify_user(_req.requested_by,
    CASE WHEN _approve THEN 'deadline.change_approved' ELSE 'deadline.change_rejected' END,
    CASE WHEN _approve THEN 'Yêu cầu đổi deadline được duyệt' ELSE 'Yêu cầu đổi deadline bị từ chối' END,
    COALESCE(_name,'') || CASE WHEN _approve THEN ' — deadline mới: ' || _stamp
                               ELSE ' — ' || COALESCE(btrim(_note),'') END,
    _req.entity_type, _req.entity_id,
    CASE WHEN _req.entity_type = 'task' THEN '/tasks/' ELSE '/projects/' END || _req.entity_id::text,
    'deadline.decision:' || _request::text || ':' || _req.requested_by::text);
END; $$;

-- ============================================================
-- 7. RPC: lưu trữ / khôi phục thủ công (chỉ Admin và CMO)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_manual_archive(
  _entity_type text, _entity_id uuid, _archived boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _name text; _was timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cmo')) THEN
    RAISE EXCEPTION 'Chỉ Admin hoặc CMO được lưu trữ hoặc khôi phục thủ công';
  END IF;
  IF _entity_type NOT IN ('task','project') THEN RAISE EXCEPTION 'Loại đối tượng không hợp lệ'; END IF;

  IF _entity_type = 'task' THEN
    SELECT manually_archived_at, name INTO _was, _name FROM public.tasks WHERE id = _entity_id;
    IF _name IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
    IF (_was IS NOT NULL) = _archived THEN RETURN; END IF;
    UPDATE public.tasks
       SET manually_archived_at = CASE WHEN _archived THEN now() ELSE NULL END,
           manually_archived_by = CASE WHEN _archived THEN auth.uid() ELSE NULL END
     WHERE id = _entity_id;
  ELSE
    SELECT manually_archived_at, name INTO _was, _name FROM public.projects WHERE id = _entity_id;
    IF _name IS NULL THEN RAISE EXCEPTION 'Không tìm thấy dự án'; END IF;
    IF (_was IS NOT NULL) = _archived THEN RETURN; END IF;
    UPDATE public.projects
       SET manually_archived_at = CASE WHEN _archived THEN now() ELSE NULL END,
           manually_archived_by = CASE WHEN _archived THEN auth.uid() ELSE NULL END
     WHERE id = _entity_id;
  END IF;

  PERFORM public.write_audit(
    CASE WHEN _archived THEN 'manual_archive.archived' ELSE 'manual_archive.restored' END,
    _entity_type, _entity_id,
    jsonb_build_object('manually_archived_at', _was),
    jsonb_build_object('manually_archived_at', CASE WHEN _archived THEN now() ELSE NULL END),
    '{}'::jsonb);
END; $$;

-- ============================================================
-- 8. Quyền thực thi: chỉ người đã đăng nhập
-- ============================================================
REVOKE ALL ON FUNCTION public.can_request_deadline_change(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_approve_deadline_change(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deadline_change_request(text, uuid, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deadline_change_decide(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_manual_archive(text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stamp_task_completion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_project_completion() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_request_deadline_change(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_approve_deadline_change(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deadline_change_request(text, uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deadline_change_decide(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_manual_archive(text, uuid, boolean) TO authenticated;