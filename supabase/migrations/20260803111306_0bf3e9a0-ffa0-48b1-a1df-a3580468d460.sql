CREATE OR REPLACE FUNCTION public.task_member_withdraw(_task uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t record; _prev text; _actor text;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task AND deleted_at IS NULL FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
  IF t.created_by <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được thu hồi'; END IF;
  IF t.approval_status NOT IN ('pending','changes_requested') THEN
    RAISE EXCEPTION 'Yêu cầu này đã được xử lý và không thể thu hồi.';
  END IF;

  _prev := t.approval_status::text;
  SELECT COALESCE(display_name, email, 'Người dùng') INTO _actor
    FROM public.profiles WHERE id = auth.uid();

  PERFORM set_config('cen.task_approval','on',true);
  UPDATE public.tasks
     SET approval_status = 'withdrawn',
         approval_decided_at = now(),
         approval_decided_by = auth.uid()
   WHERE id = _task;

  -- Vô hiệu hóa thông báo "cần duyệt" đang chờ xử lý của công việc này
  UPDATE public.notifications
     SET read_at = now()
   WHERE entity_type = 'task'
     AND entity_id = _task
     AND read_at IS NULL
     AND event_type LIKE 'task.approval_request%';

  PERFORM public.write_audit('task.approval_withdrawn','task',_task,
    jsonb_build_object('approval_status', _prev),
    jsonb_build_object('approval_status','withdrawn'),
    jsonb_build_object(
      'message', COALESCE(_actor,'Người dùng') || ' đã thu hồi yêu cầu tạo công việc.',
      'task_name', t.name,
      'previous_status', _prev,
      'withdrawn_at', now()
    ));
END; $function$;

CREATE OR REPLACE FUNCTION public.task_member_resubmit(_task uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task AND deleted_at IS NULL;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
  IF t.created_by <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được gửi lại'; END IF;
  IF t.approval_status <> 'changes_requested' THEN
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