CREATE OR REPLACE FUNCTION public.task_participants_visible()
RETURNS TABLE(task_id uuid, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH visible AS (
    SELECT t.id FROM public.tasks t
    WHERE t.deleted_at IS NULL AND public.can_view_task(t.id)
  )
  SELECT tp.task_id, tp.user_id
  FROM public.task_participants tp
  WHERE auth.uid() IS NOT NULL
    AND (tp.user_id = auth.uid() OR tp.task_id IN (SELECT id FROM visible));
$$;

GRANT EXECUTE ON FUNCTION public.task_participants_visible() TO authenticated, service_role;