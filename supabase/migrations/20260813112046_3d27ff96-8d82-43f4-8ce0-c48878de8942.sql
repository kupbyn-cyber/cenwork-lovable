CREATE OR REPLACE FUNCTION public.notify_daily_report_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _link text; _author_name text; _reviewer uuid; _author_is_leader boolean; _body text;
BEGIN
  _link := '/reports/daily/' || NEW.id::text;
  SELECT display_name INTO _author_name FROM public.profiles WHERE id = NEW.author_id;

  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submitted') THEN
    _author_is_leader := public.has_role(NEW.author_id, 'leader');
    IF _author_is_leader THEN
      FOR _reviewer IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'cmo' LOOP
        PERFORM public.notify_user(_reviewer, 'report.daily_submitted', 'Báo cáo ngày chờ duyệt',
          COALESCE(_author_name,'Thành viên') || ' — ' || to_char(NEW.report_date,'DD/MM/YYYY'),
          'daily_report', NEW.id, _link,
          'report.daily_submitted:' || NEW.id::text || ':' || COALESCE(NEW.submitted_at, now())::date::text || ':' || _reviewer::text);
      END LOOP;
    ELSE
      SELECT t.leader_id INTO _reviewer FROM public.teams t
       WHERE t.id = COALESCE(NEW.team_id, (SELECT primary_team_id FROM public.profiles WHERE id = NEW.author_id));
      PERFORM public.notify_user(_reviewer, 'report.daily_submitted', 'Báo cáo ngày chờ duyệt',
        COALESCE(_author_name,'Thành viên') || ' — ' || to_char(NEW.report_date,'DD/MM/YYYY'),
        'daily_report', NEW.id, _link,
        'report.daily_submitted:' || NEW.id::text || ':' || COALESCE(NEW.submitted_at, now())::date::text || ':' || COALESCE(_reviewer::text,'none'));
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'changes_requested' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notify_user(NEW.author_id, 'report.daily_changes_requested', 'Báo cáo ngày cần chỉnh sửa',
      to_char(NEW.report_date,'DD/MM/YYYY'), 'daily_report', NEW.id, _link,
      'report.daily_changes:' || NEW.id::text || ':' || COALESCE(NEW.reviewed_at, now())::text);
  END IF;

  -- CEN-NOTIFY-01: thông báo cá nhân khi báo cáo ngày được duyệt
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
    _body := to_char(NEW.report_date,'DD/MM/YYYY')
      || CASE WHEN COALESCE(btrim(NEW.review_note),'') = '' THEN '' ELSE ' — ' || btrim(NEW.review_note) END;
    PERFORM public.notify_user(NEW.author_id, 'report.daily_approved', 'Báo cáo ngày của bạn đã được duyệt',
      _body, 'daily_report', NEW.id, _link,
      'report.daily_approved:' || NEW.id::text);
  END IF;

  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_weekly_report_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _link text; _team_name text; _reviewer uuid; _week int; _body text;
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

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    -- CEN-NOTIFY-01: thông báo cá nhân cho người gửi báo cáo tuần
    IF TG_OP = 'UPDATE' THEN
      _body := COALESCE(_team_name,'Team') || ' — tuần ' || to_char(NEW.week_start,'DD/MM/YYYY')
        || CASE WHEN COALESCE(btrim(NEW.review_note),'') = '' THEN '' ELSE ' — ' || btrim(NEW.review_note) END;
      PERFORM public.notify_user(NEW.leader_id, 'report.weekly_approved', 'Báo cáo tuần của bạn đã được duyệt',
        _body, 'weekly_report', NEW.id, _link,
        'report.weekly_approved:' || NEW.id::text);
    END IF;

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
END; $$;

REVOKE ALL ON FUNCTION public.notify_daily_report_events() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_weekly_report_events() FROM anon, authenticated;