ALTER TABLE public.telegram_outbox DROP CONSTRAINT telegram_outbox_target_type_check;
ALTER TABLE public.telegram_outbox ADD CONSTRAINT telegram_outbox_target_type_check
  CHECK (target_type = ANY (ARRAY['user'::text, 'team'::text, 'group_topic'::text]));

CREATE OR REPLACE FUNCTION public.enqueue_daily_report_telegram()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _chat text; _topic text; _author text; _team text; _msg text;
BEGIN
  IF NEW.status <> 'submitted' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' THEN RETURN NEW; END IF;

  BEGIN
    SELECT NULLIF(btrim(group_chat_id), ''), NULLIF(btrim(daily_report_topic_id), '')
      INTO _chat, _topic
    FROM public.telegram_config WHERE id;
    IF _chat IS NULL OR _topic IS NULL THEN RETURN NEW; END IF;

    SELECT display_name INTO _author FROM public.profiles WHERE id = NEW.author_id;
    SELECT t.name INTO _team FROM public.teams t
     WHERE t.id = COALESCE(NEW.team_id, (SELECT primary_team_id FROM public.profiles WHERE id = NEW.author_id));

    _msg := '📋 BÁO CÁO NGÀY ' || to_char(NEW.report_date, 'DD/MM/YYYY') || E'\n'
         || '👤 ' || COALESCE(_author, 'Thành viên') || ' | ' || COALESCE(_team, 'Chưa có Team') || E'\n\n'
         || COALESCE(NULLIF(btrim(NEW.results), ''), '✅ HOÀN THÀNH (0)' || E'\nKhông có') || E'\n\n'
         || COALESCE(NULLIF(btrim(NEW.blockers), ''), '⚠️ QUÁ HẠN (0)' || E'\nKhông có') || E'\n\n'
         || COALESCE(NULLIF(btrim(NEW.next_plan), ''), '⏳ CÒN CHỜ (0)' || E'\nKhông có') || E'\n\n'
         || '🕒 Gửi lúc: '
         || to_char(COALESCE(NEW.submitted_at, now()) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI');

    INSERT INTO public.telegram_outbox
      (target_type, target_id, chat_id, topic_id, message, dedupe_key, message_type, report_id)
    VALUES
      ('group_topic', NEW.author_id, _chat, _topic, _msg,
       'daily_report:' || NEW.id::text, 'daily_report', NEW.id)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Không để lỗi tích hợp Telegram làm hỏng việc lưu báo cáo.
    BEGIN
      INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, result, metadata)
      VALUES (NEW.author_id, 'telegram.enqueue_failed', 'daily_reports', NEW.id, 'failure',
              jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  RETURN NEW;
END; $function$;