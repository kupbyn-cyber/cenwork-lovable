ALTER TABLE public.weekly_reports ADD COLUMN IF NOT EXISTS snapshot jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS weekly_reports_team_week_unique
  ON public.weekly_reports (team_id, week_start);

CREATE OR REPLACE FUNCTION public.notify_weekly_report_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _link text; _team_name text; _reviewer uuid; _week int;
BEGIN
  _link := '/reports/weekly/' || NEW.id::text;
  SELECT name INTO _team_name FROM public.teams WHERE id = NEW.team_id;
  _week := EXTRACT(WEEK FROM NEW.week_start)::int;

  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submitted') THEN
    FOR _reviewer IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('cmo','admin') LOOP
      PERFORM public.notify_user(_reviewer, 'report.weekly_submitted', 'Báo cáo tuần chờ duyệt',
        COALESCE(_team_name,'Team') || ' — Tuần ' || _week::text,
        'weekly_report', NEW.id, _link,
        'report.weekly_submitted:' || NEW.id::text || ':' || COALESCE(NEW.submitted_at, now())::date::text || ':' || _reviewer::text);
    END LOOP;
    -- REPORT-WEEKLY-FLOW-01: không gửi Telegram khi mới gửi duyệt.
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'changes_requested' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notify_user(NEW.leader_id, 'report.weekly_changes_requested', 'Báo cáo tuần cần chỉnh sửa',
      COALESCE(_team_name,'Team') || ' — Tuần ' || _week::text,
      'weekly_report', NEW.id, _link,
      'report.weekly_changes:' || NEW.id::text || ':' || COALESCE(NEW.reviewed_at, now())::text);
  END IF;

  -- Chỉ sau khi duyệt mới đẩy Telegram, và chỉ thông báo ngắn.
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    BEGIN
      PERFORM public.notify_team_telegram(NEW.team_id,
        'Báo cáo tuần ' || _week::text || ' của Team ' || COALESCE(_team_name,'—')
          || ' đã được duyệt. Xem chi tiết trên CEN.',
        'report.weekly_approved:' || NEW.id::text);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, result, metadata)
        VALUES (NEW.leader_id, 'telegram.enqueue_failed', 'weekly_reports', NEW.id, 'failure',
                jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END IF;

  RETURN NEW;
END; $function$;