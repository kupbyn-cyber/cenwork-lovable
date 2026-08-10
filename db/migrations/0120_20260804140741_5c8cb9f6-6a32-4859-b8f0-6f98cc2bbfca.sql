CREATE OR REPLACE FUNCTION public.enqueue_daily_report_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _chat text; _topic text; _author text; _team text; _msg text; _reviewer text;
  _lines text[]; _results text; _extra int;
BEGIN
  -- Chỉ gửi Telegram SAU KHI báo cáo được duyệt.
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  BEGIN
    SELECT NULLIF(btrim(group_chat_id), ''), NULLIF(btrim(daily_report_topic_id), '')
      INTO _chat, _topic
    FROM public.telegram_config WHERE id;
    IF _chat IS NULL OR _topic IS NULL THEN RETURN NEW; END IF;

    SELECT display_name INTO _author FROM public.profiles WHERE id = NEW.author_id;
    SELECT display_name INTO _reviewer FROM public.profiles WHERE id = NEW.reviewer_id;
    SELECT t.name INTO _team FROM public.teams t
     WHERE t.id = COALESCE(NEW.team_id, (SELECT primary_team_id FROM public.profiles WHERE id = NEW.author_id));

    _results := COALESCE(NULLIF(btrim(NEW.results), ''), 'Không có Task hoàn thành hôm nay.');
    _lines := string_to_array(_results, E'\n');
    IF array_length(_lines, 1) > 10 THEN
      _extra := array_length(_lines, 1) - 10;
      _results := array_to_string(_lines[1:10], E'\n')
        || E'\n' || 'Còn ' || _extra || ' Task khác. Xem chi tiết trên CEN.';
    END IF;

    _msg := 'BÁO CÁO NGÀY ' || to_char(NEW.report_date, 'DD/MM/YYYY') || E'\n'
         || 'Người gửi: ' || COALESCE(_author, 'Thành viên') || E'\n'
         || 'Team: ' || COALESCE(_team, 'Chưa có Team') || E'\n\n'
         || 'Task hoàn thành:' || E'\n' || _results || E'\n\n'
         || COALESCE(NULLIF(btrim(NEW.blockers), ''), 'Còn mở: 0 | Quá hạn: 0 | Chờ kiểm tra: 0') || E'\n\n'
         || 'Ghi chú: ' || COALESCE(NULLIF(btrim(NEW.next_plan), ''), 'Không có') || E'\n'
         || 'Người duyệt: ' || COALESCE(_reviewer, 'Không xác định');

    INSERT INTO public.telegram_outbox
      (target_type, target_id, chat_id, topic_id, message, dedupe_key, message_type, report_id)
    VALUES
      ('group_topic', NEW.author_id, _chat, _topic, _msg,
       'daily_report_approved:' || NEW.id::text, 'daily_report', NEW.id)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, result, metadata)
      VALUES (NEW.author_id, 'telegram.enqueue_failed', 'daily_reports', NEW.id, 'failure',
              jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  RETURN NEW;
END; $function$;