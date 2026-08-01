ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS tasks_deleted_at_idx ON public.tasks (deleted_at);
CREATE INDEX IF NOT EXISTS projects_deleted_at_idx ON public.projects (deleted_at);

-- Ẩn dữ liệu xóa mềm khỏi mọi truy vấn vận hành (kể cả join lồng nhau).
DROP POLICY IF EXISTS tasks_select_scoped ON public.tasks;
CREATE POLICY tasks_select_scoped ON public.tasks
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND can_view_task(id));

DROP POLICY IF EXISTS projects_select_scoped ON public.projects;
CREATE POLICY projects_select_scoped ON public.projects
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND can_view_project(id));

-- Dự án bị xóa mềm → các công việc thuộc dự án rời khỏi danh sách vận hành,
-- nhưng bản ghi công việc vẫn giữ nguyên (không cascade delete).
CREATE OR REPLACE FUNCTION public.can_view_task(_task uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.tasks t JOIN public.projects p ON p.id = t.project_id
           WHERE t.id = _task AND p.deleted_at IS NOT NULL
         )
     AND (
       public.has_role(auth.uid(),'admin')
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
       )
     );
$function$;

-- Hoàn thành dự án: bỏ qua công việc đã xóa mềm.
CREATE OR REPLACE FUNCTION public.enforce_project_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _open int;
BEGIN
  IF NEW.status IN ('completed','archived') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT count(*) INTO _open
    FROM public.tasks t
    WHERE t.project_id = NEW.id
      AND t.deleted_at IS NULL
      AND t.is_archived = false
      AND t.status <> 'done';
    IF _open > 0 THEN
      RAISE EXCEPTION 'Còn % công việc chưa hoàn thành. Cần hoàn thành toàn bộ công việc của dự án trước khi hoàn thành hoặc lưu trữ dự án.', _open;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Xóa mềm: chỉ Admin, không xóa cứng, không cascade, có ghi nhật ký.
CREATE OR REPLACE FUNCTION public.soft_delete_entity(_entity_type text, _entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _name text; _already timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Chỉ Admin được xóa dữ liệu';
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

REVOKE ALL ON FUNCTION public.soft_delete_entity(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_entity(text, uuid) TO authenticated;