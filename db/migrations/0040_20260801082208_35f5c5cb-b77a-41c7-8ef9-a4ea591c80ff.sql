ALTER TABLE public.telegram_config ADD COLUMN IF NOT EXISTS daily_report_topic_id text;

ALTER TABLE public.telegram_outbox
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'notification',
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.daily_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS telegram_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_outbox_daily_report_unique
  ON public.telegram_outbox (report_id)
  WHERE message_type = 'daily_report' AND report_id IS NOT NULL;

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

  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_enqueue_daily_report_telegram ON public.daily_reports;
CREATE TRIGGER trg_enqueue_daily_report_telegram
AFTER INSERT OR UPDATE OF status ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.enqueue_daily_report_telegram();