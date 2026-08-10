ALTER TABLE public.tasks
  ALTER COLUMN deadline TYPE timestamptz
  USING ((deadline::text || ' 23:59:00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

CREATE OR REPLACE FUNCTION public.validate_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _manage boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

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

  IF OLD.is_archived AND NOT public.has_role(auth.uid(),'admin') THEN
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
$$;