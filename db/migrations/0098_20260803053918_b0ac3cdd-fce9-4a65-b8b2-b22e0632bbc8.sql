-- 1) Trạng thái duyệt riêng cho Task
DO $$ BEGIN
  CREATE TYPE public.task_approval_status AS ENUM ('pending','changes_requested','approved','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS approval_status public.task_approval_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approval_round integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_decided_by uuid,
  ADD COLUMN IF NOT EXISTS approval_note text;

UPDATE public.tasks SET approval_status = 'approved' WHERE approval_status IS DISTINCT FROM 'approved';

CREATE INDEX IF NOT EXISTS tasks_approval_status_idx ON public.tasks (approval_status);

-- 2) Người duyệt = Leader Team phụ trách của Dự án, hoặc Admin/CMO
CREATE OR REPLACE FUNCTION public.can_approve_task_submission(_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        JOIN public.projects p ON p.id = t.project_id
        JOIN public.teams tm ON tm.id = p.responsible_team_id
        WHERE t.id = _task AND tm.leader_id = auth.uid()
      );
$$;

-- 3) Member không còn tạo Task độc lập
CREATE OR REPLACE FUNCTION public.can_create_task(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _project IS NULL THEN public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR public.leader_team_id(auth.uid()) IS NOT NULL
    WHEN NOT public.is_project_approved(_project) THEN false
    ELSE public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR public.can_manage_project(_project)
      OR (public.leader_team_id(auth.uid()) IS NOT NULL AND public.can_view_project(_project))
  END;
$$;

-- 4) Ràng buộc luồng duyệt trong trigger validate_task
CREATE OR REPLACE FUNCTION public.validate_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _manage boolean;
  _flow boolean := COALESCE(current_setting('cen.task_approval', true), '') = 'on';
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

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
    IF NEW.approval_status <> 'approved' THEN
      IF NOT _flow THEN
        RAISE EXCEPTION 'Công việc chờ duyệt phải được gửi qua chức năng gửi Leader duyệt';
      END IF;
      IF NEW.project_id IS NULL OR NEW.assignee_id <> auth.uid() OR NEW.status <> 'not_started' THEN
        RAISE EXCEPTION 'Yêu cầu duyệt công việc không hợp lệ';
      END IF;
      RETURN NEW;
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

  IF NOT _flow AND (
       NEW.approval_status IS DISTINCT FROM OLD.approval_status
       OR NEW.approval_round IS DISTINCT FROM OLD.approval_round
       OR NEW.approval_decided_by IS DISTINCT FROM OLD.approval_decided_by
       OR NEW.approval_decided_at IS DISTINCT FROM OLD.approval_decided_at
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     ) THEN
    RAISE EXCEPTION 'Không được thay đổi trạng thái duyệt trực tiếp';
  END IF;

  IF NEW.approval_status <> 'approved' AND NEW.status <> 'not_started' THEN
    RAISE EXCEPTION 'Công việc chưa được duyệt, không thể đổi tiến độ';
  END IF;

  IF NOT _flow AND OLD.approval_status IN ('pending','changes_requested','withdrawn')
     AND OLD.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'Chỉ người gửi được chỉnh sửa yêu cầu chờ duyệt';
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
  ELSIF NOT _flow THEN
    IF NOT public.can_assign_task(NEW.project_id, NEW.team_id, NEW.assignee_id) THEN
      RAISE EXCEPTION 'Bạn không có quyền giao việc cho người này';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 5) Không thông báo "được giao việc" khi Task chưa duyệt
CREATE OR REPLACE FUNCTION public.notify_task_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _link text; _leader uuid; _owner uuid; _stamp text;
BEGIN
  _link := '/tasks/' || NEW.id::text;
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status <> 'approved' THEN RETURN NEW; END IF;
    PERFORM public.notify_user(NEW.assignee_id, 'task.assigned', 'Bạn được giao công việc mới',
      NEW.name, 'task', NEW.id, _link, 'task.assigned:' || NEW.id::text);
    PERFORM public.notify_team_telegram(NEW.team_id,
      'Công việc mới: ' || NEW.name, 'task.assigned:' || NEW.id::text);
    RETURN NEW;
  END IF;

  IF NEW.approval_status <> 'approved' THEN RETURN NEW; END IF;

  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    PERFORM public.notify_user(NEW.assignee_id, 'task.assigned', 'Bạn được giao công việc mới',
      NEW.name, 'task', NEW.id, _link, 'task.assigned:' || NEW.id::text);
    PERFORM public.notify_team_telegram(NEW.team_id,
      'Công việc mới: ' || NEW.name, 'task.assigned:' || NEW.id::text);
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    PERFORM public.notify_user(NEW.assignee_id, 'task.assignee_changed', 'Bạn được chuyển phụ trách công việc',
      NEW.name, 'task', NEW.id, _link, 'task.assignee_changed:' || NEW.id::text || ':' || NEW.assignee_id::text);
  END IF;

  IF NEW.deadline IS DISTINCT FROM OLD.deadline THEN
    _stamp := to_char(NEW.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI');
    PERFORM public.notify_user(NEW.assignee_id, 'task.deadline_changed', 'Deadline công việc đã thay đổi',
      NEW.name || ' — deadline mới: ' || _stamp, 'task', NEW.id, _link,
      'task.deadline_changed:' || NEW.id::text || ':' || extract(epoch from NEW.deadline)::bigint::text);
  END IF;

  IF NEW.status = 'review' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notify_user(NEW.created_by, 'task.review_requested', 'Công việc chờ kiểm tra',
      NEW.name, 'task', NEW.id, _link, 'task.review:' || NEW.id::text || ':' || NEW.created_by::text);
    IF NEW.team_id IS NOT NULL THEN
      SELECT leader_id INTO _leader FROM public.teams WHERE id = NEW.team_id;
      PERFORM public.notify_user(_leader, 'task.review_requested', 'Công việc chờ kiểm tra',
        NEW.name, 'task', NEW.id, _link, 'task.review:' || NEW.id::text || ':' || COALESCE(_leader::text,'none'));
    END IF;
    IF NEW.project_id IS NOT NULL THEN
      SELECT owner_id INTO _owner FROM public.projects WHERE id = NEW.project_id;
      PERFORM public.notify_user(_owner, 'task.review_requested', 'Công việc chờ kiểm tra',
        NEW.name, 'task', NEW.id, _link, 'task.review:' || NEW.id::text || ':' || COALESCE(_owner::text,'none'));
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- 6) Thông báo yêu cầu duyệt tới đúng người
CREATE OR REPLACE FUNCTION public.task_submission_notify(_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t record; _leader uuid; r record; _link text; _key text; _body text;
BEGIN
  SELECT tk.id, tk.name, tk.approval_round, p.name AS project_name, p.responsible_team_id
    INTO t
  FROM public.tasks tk JOIN public.projects p ON p.id = tk.project_id
  WHERE tk.id = _task;
  IF t.id IS NULL THEN RETURN; END IF;

  _link := '/tasks/' || _task::text;
  _body := t.name || ' — Dự án: ' || t.project_name;
  _key := 'task.approval_requested:' || _task::text || ':' || t.approval_round::text;

  SELECT leader_id INTO _leader FROM public.teams WHERE id = t.responsible_team_id;

  IF _leader IS NOT NULL THEN
    PERFORM public.notify_user(_leader, 'task.approval_requested', 'Công việc chờ bạn phê duyệt',
      _body, 'task', _task, _link, _key || ':' || _leader::text);
  ELSE
    FOR r IN SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','cmo') LOOP
      PERFORM public.notify_user(r.user_id, 'task.approval_requested', 'Công việc chờ phê duyệt (Team chưa có Leader)',
        _body, 'task', _task, _link, _key || ':' || r.user_id::text);
    END LOOP;
  END IF;
END; $function$;

-- 7) Member gửi Task chờ duyệt
CREATE OR REPLACE FUNCTION public.task_member_submit(
  _project uuid, _name text, _description text, _start_date date,
  _deadline timestamptz, _priority public.task_priority, _participants uuid[] DEFAULT '{}'::uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _team uuid; _task uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập'; END IF;
  IF public.perm_scope(_uid,'tasks.create') = 'none' THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo công việc';
  END IF;
  IF _project IS NULL THEN RAISE EXCEPTION 'Cần chọn dự án'; END IF;
  IF COALESCE(btrim(_name),'') = '' THEN RAISE EXCEPTION 'Nhập tên công việc'; END IF;
  IF _deadline IS NULL THEN RAISE EXCEPTION 'Nhập deadline'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND p.deleted_at IS NULL
                   AND p.status <> 'archived' AND p.manually_archived_at IS NULL) THEN
    RAISE EXCEPTION 'Dự án không khả dụng để tạo công việc';
  END IF;
  IF NOT public.is_project_approved(_project) THEN
    RAISE EXCEPTION 'Dự án chưa được duyệt';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_members pm
                 WHERE pm.project_id = _project AND pm.user_id = _uid) THEN
    RAISE EXCEPTION 'Bạn không tham gia dự án này';
  END IF;

  SELECT responsible_team_id INTO _team FROM public.projects WHERE id = _project;
  IF _team IS NULL THEN
    RAISE EXCEPTION 'Dự án chưa có Team phụ trách. Vui lòng liên hệ Admin/CMO để cập nhật.';
  END IF;

  PERFORM set_config('cen.task_approval','on',true);

  INSERT INTO public.tasks (name, description, project_id, assignee_id, team_id, start_date,
                            deadline, priority, status, created_by,
                            approval_status, approval_round, submitted_at)
  VALUES (btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), _project, _uid, _team, _start_date,
          _deadline, COALESCE(_priority,'medium'), 'not_started', _uid,
          'pending', 1, now())
  RETURNING id INTO _task;

  INSERT INTO public.task_participants (task_id, user_id)
  SELECT _task, u FROM unnest(COALESCE(_participants,'{}'::uuid[])) u
  WHERE u <> _uid AND public.is_in_project_scope(_project, u)
  ON CONFLICT DO NOTHING;

  PERFORM public.write_audit('task.approval_requested','task',_task,NULL,
    jsonb_build_object('approval_status','pending','round',1), '{}'::jsonb);
  PERFORM public.task_submission_notify(_task);
  RETURN _task;
END; $function$;

-- 8) Member gửi lại
CREATE OR REPLACE FUNCTION public.task_member_resubmit(_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task AND deleted_at IS NULL;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
  IF t.created_by <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được gửi lại'; END IF;
  IF t.approval_status NOT IN ('changes_requested','withdrawn') THEN
    RAISE EXCEPTION 'Yêu cầu không ở trạng thái có thể gửi lại';
  END IF;
  PERFORM set_config('cen.task_approval','on',true);
  UPDATE public.tasks
     SET approval_status = 'pending', approval_round = approval_round + 1,
         submitted_at = now(), approval_decided_at = NULL, approval_decided_by = NULL
   WHERE id = _task;
  PERFORM public.write_audit('task.approval_resubmitted','task',_task,NULL,
    jsonb_build_object('approval_status','pending'), '{}'::jsonb);
  PERFORM public.task_submission_notify(_task);
END; $function$;

-- 9) Member thu hồi
CREATE OR REPLACE FUNCTION public.task_member_withdraw(_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task AND deleted_at IS NULL;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
  IF t.created_by <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được thu hồi'; END IF;
  IF t.approval_status NOT IN ('pending','changes_requested') THEN
    RAISE EXCEPTION 'Chỉ thu hồi được yêu cầu chưa duyệt';
  END IF;
  PERFORM set_config('cen.task_approval','on',true);
  UPDATE public.tasks SET approval_status = 'withdrawn' WHERE id = _task;
  PERFORM public.write_audit('task.approval_withdrawn','task',_task,NULL,
    jsonb_build_object('approval_status','withdrawn'), '{}'::jsonb);
END; $function$;

-- 10) Leader/Admin/CMO xử lý
CREATE OR REPLACE FUNCTION public.task_approval_decide(_task uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t record; _link text; _pname text; _clean text := NULLIF(btrim(COALESCE(_note,'')),'');
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task AND deleted_at IS NULL;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
  IF t.approval_status NOT IN ('pending','changes_requested') THEN
    RAISE EXCEPTION 'Yêu cầu không ở trạng thái chờ xử lý';
  END IF;
  IF NOT public.can_approve_task_submission(_task) THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt công việc này';
  END IF;
  IF NOT _approve AND _clean IS NULL THEN
    RAISE EXCEPTION 'Cần nhập lý do yêu cầu chỉnh sửa';
  END IF;

  PERFORM set_config('cen.task_approval','on',true);
  UPDATE public.tasks
     SET approval_status = CASE WHEN _approve THEN 'approved'::public.task_approval_status
                                ELSE 'changes_requested'::public.task_approval_status END,
         status = 'not_started',
         approval_decided_at = now(),
         approval_decided_by = auth.uid(),
         approval_note = _clean
   WHERE id = _task;

  SELECT name INTO _pname FROM public.projects WHERE id = t.project_id;
  _link := '/tasks/' || _task::text;

  IF _approve THEN
    PERFORM public.write_audit('task.approval_approved','task',_task,NULL,
      jsonb_build_object('approval_status','approved'), '{}'::jsonb);
    PERFORM public.notify_user(t.created_by, 'task.approval_approved', 'Công việc đã được duyệt',
      t.name || ' — Dự án: ' || COALESCE(_pname,'—'), 'task', _task, _link,
      'task.approval_approved:' || _task::text || ':' || t.approval_round::text);
  ELSE
    PERFORM public.write_audit('task.approval_changes_requested','task',_task,NULL,
      jsonb_build_object('approval_status','changes_requested','note',_clean), '{}'::jsonb);
    PERFORM public.notify_user(t.created_by, 'task.approval_changes_requested', 'Công việc cần chỉnh sửa',
      t.name || ' — Dự án: ' || COALESCE(_pname,'—') || E'\nLý do: ' || _clean, 'task', _task, _link,
      'task.approval_changes:' || _task::text || ':' || t.approval_round::text);
  END IF;
END; $function$;

GRANT EXECUTE ON FUNCTION public.can_approve_task_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_member_submit(uuid, text, text, date, timestamptz, public.task_priority, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_member_resubmit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_member_withdraw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_approval_decide(uuid, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.task_submission_notify(uuid) FROM PUBLIC, anon, authenticated;