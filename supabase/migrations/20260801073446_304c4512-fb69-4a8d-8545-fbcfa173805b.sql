CREATE OR REPLACE FUNCTION public.enforce_project_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _open int;
BEGIN
  IF NEW.status IN ('completed','archived') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT count(*) INTO _open
    FROM public.tasks t
    WHERE t.project_id = NEW.id
      AND t.is_archived = false
      AND t.status <> 'done';
    IF _open > 0 THEN
      RAISE EXCEPTION 'Còn % công việc chưa hoàn thành. Cần hoàn thành toàn bộ công việc của dự án trước khi hoàn thành hoặc lưu trữ dự án.', _open;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_project_completion ON public.projects;
CREATE TRIGGER trg_enforce_project_completion
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_project_completion();