-- 1. Cột kết quả trên tasks (an toàn với dữ liệu cũ: NULL)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS result_text text,
  ADD COLUMN IF NOT EXISTS result_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result_updated_at timestamptz;

-- 2. Lịch sử kết quả
CREATE TABLE IF NOT EXISTS public.task_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  result_text text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_results_task_idx ON public.task_results(task_id, created_at DESC);

GRANT SELECT ON public.task_results TO authenticated;
GRANT ALL ON public.task_results TO service_role;

ALTER TABLE public.task_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_results_select" ON public.task_results;
CREATE POLICY "task_results_select" ON public.task_results
  FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));

-- 3. Ràng buộc nghiệp vụ + tự ghi người/thời gian cập nhật
CREATE OR REPLACE FUNCTION public.enforce_task_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _changed := NEW.result_text IS NOT NULL AND btrim(NEW.result_text) <> '';
  ELSE
    _changed := NEW.result_text IS DISTINCT FROM OLD.result_text;
  END IF;

  IF NEW.result_text IS NOT NULL AND btrim(NEW.result_text) = '' THEN
    NEW.result_text := NULL;
  END IF;

  IF _changed AND _uid IS NOT NULL THEN
    IF NOT (NEW.assignee_id = _uid OR public.can_manage_task(NEW.id)) THEN
      RAISE EXCEPTION 'Chỉ người phụ trách hoặc người quản lý công việc mới được cập nhật kết quả';
    END IF;
  END IF;

  IF _changed THEN
    NEW.result_updated_at := now();
    NEW.result_updated_by := COALESCE(_uid, NEW.result_updated_by);
  END IF;

  -- Bắt buộc có kết quả khi chuyển sang Hoàn thành
  IF NEW.status = 'done'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done')
     AND (NEW.result_text IS NULL OR btrim(NEW.result_text) = '') THEN
    RAISE EXCEPTION 'Cần nhập Kết quả công việc trước khi hoàn thành';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_task_result ON public.tasks;
CREATE TRIGGER enforce_task_result
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_result();

-- 4. Ghi lịch sử mỗi lần kết quả thay đổi
CREATE OR REPLACE FUNCTION public.log_task_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.result_text IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.result_text IS DISTINCT FROM OLD.result_text) THEN
    INSERT INTO public.task_results (task_id, result_text, created_by, created_at)
    VALUES (NEW.id, NEW.result_text, NEW.result_updated_by, COALESCE(NEW.result_updated_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_task_result ON public.tasks;
CREATE TRIGGER log_task_result
  AFTER INSERT OR UPDATE OF result_text ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_result();

REVOKE EXECUTE ON FUNCTION public.enforce_task_result() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_task_result() FROM PUBLIC, anon, authenticated;