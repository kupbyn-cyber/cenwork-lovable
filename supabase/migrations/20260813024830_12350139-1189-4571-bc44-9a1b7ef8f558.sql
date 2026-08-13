CREATE OR REPLACE FUNCTION public.task_cancel(_task uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t public.tasks%ROWTYPE;
  _allowed boolean := false;
  _clean text := nullif(btrim(coalesce(_reason,'')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

  SELECT * INTO t FROM public.tasks WHERE id = _task AND deleted_at IS NULL;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;

  IF t.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Công việc đã được hủy trước đó'; END IF;
  IF t.status = 'done' THEN RAISE EXCEPTION 'Không thể hủy công việc đã hoàn thành'; END IF;
  IF t.manually_archived_at IS NOT NULL THEN RAISE EXCEPTION 'Không thể hủy công việc đã lưu trữ'; END IF;

  IF public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'cmo')
     OR public.has_role(auth.uid(),'leader') THEN
    _allowed := true;
  END IF;

  IF NOT _allowed AND t.created_by = auth.uid() AND t.status = 'not_started' THEN
    _allowed := true;
  END IF;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy công việc này';
  END IF;

  IF _clean IS NULL THEN RAISE EXCEPTION 'Cần nhập lý do hủy'; END IF;

  UPDATE public.tasks
     SET cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = _clean,
         is_archived = true,
         manually_archived_at = now(),
         manually_archived_by = auth.uid()
   WHERE id = _task;

  PERFORM public.write_audit(
    'task.cancelled', 'task', _task,
    jsonb_build_object('status', t.status, 'approval_status', t.approval_status, 'cancelled_at', NULL),
    jsonb_build_object('status', t.status, 'cancelled_at', now(), 'cancelled_by', auth.uid(), 'cancel_reason', _clean),
    jsonb_build_object('reason', _clean));

  PERFORM public.task_cancel_notify(_task);
END;
$function$;

REVOKE ALL ON FUNCTION public.task_cancel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_cancel(uuid, text) TO authenticated;