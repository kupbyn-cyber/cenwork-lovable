-- ===== Enums =====
CREATE TYPE public.task_status AS ENUM ('not_started','in_progress','review','done');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high');

-- ===== Tables =====
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  project_id uuid REFERENCES public.projects(id),
  assignee_id uuid NOT NULL REFERENCES public.profiles(id),
  team_id uuid REFERENCES public.teams(id),
  start_date date,
  deadline date NOT NULL,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'not_started',
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.task_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.task_participants TO authenticated;
GRANT ALL ON public.task_participants TO service_role;
ALTER TABLE public.task_participants ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_tasks_project ON public.tasks(project_id);
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_team ON public.tasks(team_id);

-- ===== Helper functions =====
CREATE OR REPLACE FUNCTION public.can_view_task(_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = _task
          AND (
            t.created_by = auth.uid()
            OR t.assignee_id = auth.uid()
            OR (t.team_id IS NOT NULL AND t.team_id IN (SELECT public.my_team_ids()))
            OR (t.team_id IS NOT NULL AND t.team_id = public.leader_team_id(auth.uid()))
            OR (t.project_id IS NOT NULL AND public.can_view_project(t.project_id))
            OR EXISTS (SELECT 1 FROM public.task_participants tp
                       WHERE tp.task_id = t.id AND tp.user_id = auth.uid())
          )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_task(_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        LEFT JOIN public.profiles a ON a.id = t.assignee_id
        WHERE t.id = _task
          AND (
            t.created_by = auth.uid()
            OR (t.project_id IS NOT NULL AND public.can_manage_project(t.project_id))
            OR (public.leader_team_id(auth.uid()) IS NOT NULL
                AND (t.team_id = public.leader_team_id(auth.uid())
                     OR a.primary_team_id = public.leader_team_id(auth.uid())))
          )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_task_row(_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_manage_task(_task)
      OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = _task AND t.assignee_id = auth.uid());
$$;

-- Người dùng hiện tại có được tạo Task (kèm dự án tùy chọn) hay không.
CREATE OR REPLACE FUNCTION public.can_create_task(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _project IS NULL THEN public.current_app_role() IS NOT NULL
    ELSE public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR public.can_manage_project(_project)
      OR (public.leader_team_id(auth.uid()) IS NOT NULL AND public.can_view_project(_project))
  END;
$$;

-- Người phụ trách nằm trong phạm vi dự án hay không.
CREATE OR REPLACE FUNCTION public.is_in_project_scope(_project uuid, _person uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND (p.owner_id = _person OR p.created_by = _person))
      OR EXISTS (SELECT 1 FROM public.project_members pm
                 WHERE pm.project_id = _project AND pm.user_id = _person)
      OR EXISTS (SELECT 1 FROM public.project_teams pt
                 JOIN public.profiles pr ON pr.id = _person
                 WHERE pt.project_id = _project
                   AND (pt.team_id = pr.primary_team_id
                        OR EXISTS (SELECT 1 FROM public.team_collaborators tc
                                   WHERE tc.team_id = pt.team_id AND tc.user_id = _person)));
$$;

-- Người dùng hiện tại có được giao Task cho _person trong phạm vi (_project,_team) hay không.
CREATE OR REPLACE FUNCTION public.can_assign_task(_project uuid, _team uuid, _person uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _person = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR (_project IS NOT NULL AND public.can_manage_project(_project)
          AND public.is_in_project_scope(_project, _person))
      OR (public.leader_team_id(auth.uid()) IS NOT NULL
          AND (
            EXISTS (SELECT 1 FROM public.profiles pr
                    WHERE pr.id = _person AND pr.primary_team_id = public.leader_team_id(auth.uid()))
            OR EXISTS (SELECT 1 FROM public.team_collaborators tc
                       WHERE tc.user_id = _person AND tc.team_id = public.leader_team_id(auth.uid()))
            OR (_project IS NOT NULL AND public.can_view_project(_project)
                AND public.is_in_project_scope(_project, _person))
          ));
$$;

-- ===== Validation trigger =====
CREATE OR REPLACE FUNCTION public.validate_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _manage boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.start_date IS NOT NULL AND NEW.deadline < NEW.start_date THEN
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

  IF OLD.is_archived AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Công việc đã lưu trữ, không thể chỉnh sửa';
  END IF;

  IF NOT _manage THEN
    IF OLD.assignee_id <> auth.uid() THEN
      RAISE EXCEPTION 'Bạn không có quyền sửa công việc này';
    END IF;
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.team_id IS DISTINCT FROM OLD.team_id
       OR NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      RAISE EXCEPTION 'Người phụ trách chỉ được cập nhật nội dung và tiến độ';
    END IF;
  ELSE
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       AND NOT public.can_assign_task(NEW.project_id, NEW.team_id, NEW.assignee_id) THEN
      RAISE EXCEPTION 'Bạn không có quyền giao việc cho người này';
    END IF;
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
       AND NEW.project_id IS NOT NULL
       AND NOT public.can_create_task(NEW.project_id) THEN
      RAISE EXCEPTION 'Bạn không có quyền gắn công việc vào dự án này';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_tasks_validate BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_task();

CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Audit triggers =====
CREATE OR REPLACE FUNCTION public.audit_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('task.created','task', NEW.id, NULL,
      jsonb_build_object('name', NEW.name, 'project_id', NEW.project_id,
        'assignee_id', NEW.assignee_id, 'team_id', NEW.team_id,
        'deadline', NEW.deadline, 'priority', NEW.priority, 'status', NEW.status), '{}'::jsonb);
    RETURN NEW;
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    PERFORM public.write_audit('task.assignee_changed','task', NEW.id,
      jsonb_build_object('assignee_id', OLD.assignee_id),
      jsonb_build_object('assignee_id', NEW.assignee_id), '{}'::jsonb);
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    PERFORM public.write_audit('task.project_changed','task', NEW.id,
      jsonb_build_object('project_id', OLD.project_id),
      jsonb_build_object('project_id', NEW.project_id), '{}'::jsonb);
  END IF;
  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    PERFORM public.write_audit('task.team_changed','task', NEW.id,
      jsonb_build_object('team_id', OLD.team_id),
      jsonb_build_object('team_id', NEW.team_id), '{}'::jsonb);
  END IF;
  IF NEW.deadline IS DISTINCT FROM OLD.deadline OR NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    PERFORM public.write_audit('task.deadline_changed','task', NEW.id,
      jsonb_build_object('start_date', OLD.start_date, 'deadline', OLD.deadline),
      jsonb_build_object('start_date', NEW.start_date, 'deadline', NEW.deadline), '{}'::jsonb);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    PERFORM public.write_audit('task.priority_changed','task', NEW.id,
      jsonb_build_object('priority', OLD.priority),
      jsonb_build_object('priority', NEW.priority), '{}'::jsonb);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit('task.status_changed','task', NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status), '{}'::jsonb);
  END IF;
  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    PERFORM public.write_audit(
      CASE WHEN NEW.is_archived THEN 'task.archived' ELSE 'task.restored' END,
      'task', NEW.id, jsonb_build_object('is_archived', OLD.is_archived),
      jsonb_build_object('is_archived', NEW.is_archived), '{}'::jsonb);
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description THEN
    PERFORM public.write_audit('task.updated','task', NEW.id,
      jsonb_build_object('name', OLD.name),
      jsonb_build_object('name', NEW.name), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_tasks_audit AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.audit_task();

CREATE OR REPLACE FUNCTION public.audit_task_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _row jsonb := to_jsonb(COALESCE(NEW, OLD));
BEGIN
  PERFORM public.write_audit(
    'task.participant_' || CASE WHEN TG_OP = 'INSERT' THEN 'linked' ELSE 'unlinked' END,
    'task', (_row->>'task_id')::uuid, NULL,
    jsonb_build_object('user_id', (_row->>'user_id')::uuid));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_task_participants_audit AFTER INSERT OR DELETE ON public.task_participants
FOR EACH ROW EXECUTE FUNCTION public.audit_task_participant();

-- ===== Policies =====
CREATE POLICY tasks_select_scoped ON public.tasks
FOR SELECT TO authenticated USING (public.can_view_task(id));

CREATE POLICY tasks_insert_scoped ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.can_create_task(project_id));

CREATE POLICY tasks_update_scoped ON public.tasks
FOR UPDATE TO authenticated
USING (public.can_edit_task_row(id)) WITH CHECK (public.can_edit_task_row(id));

CREATE POLICY task_participants_select_scoped ON public.task_participants
FOR SELECT TO authenticated USING (public.can_view_task(task_id) OR user_id = auth.uid());

CREATE POLICY task_participants_write_managed ON public.task_participants
FOR INSERT TO authenticated WITH CHECK (public.can_manage_task(task_id));

CREATE POLICY task_participants_delete_managed ON public.task_participants
FOR DELETE TO authenticated USING (public.can_manage_task(task_id));

-- Hàm chạy ngầm: không cho gọi trực tiếp qua API
REVOKE EXECUTE ON FUNCTION public.validate_task() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_task() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_task_participant() FROM anon, authenticated;