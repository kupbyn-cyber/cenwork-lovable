CREATE OR REPLACE FUNCTION public.report_review_takeover(_kind text, _id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _old uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;
  IF NOT public.has_role(_me, 'admin') THEN
    RAISE EXCEPTION 'Chỉ Admin được tiếp quản duyệt báo cáo';
  END IF;

  IF _kind = 'daily' THEN
    SELECT reviewer_id INTO _old FROM public.daily_reports WHERE id = _id;
    UPDATE public.daily_reports SET reviewer_id = _me WHERE id = _id AND status = 'submitted';
  ELSIF _kind = 'weekly' THEN
    SELECT reviewer_id INTO _old FROM public.weekly_reports WHERE id = _id;
    UPDATE public.weekly_reports SET reviewer_id = _me WHERE id = _id AND status = 'submitted';
  ELSE
    RAISE EXCEPTION 'Loại báo cáo không hợp lệ';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chỉ tiếp quản được báo cáo đang chờ duyệt';
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_data, after_data)
  VALUES (
    CASE WHEN _kind = 'daily' THEN 'daily_report' ELSE 'weekly_report' END,
    _id,
    'review_takeover',
    _me,
    jsonb_build_object('reviewer_id', _old),
    jsonb_build_object('reviewer_id', _me, 'reason', _reason, 'taken_over_at', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_review_takeover(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_review_takeover(text, uuid, text) TO authenticated;