-- 1) Profiles: Telegram User ID + bật/tắt
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_user_id text,
  ADD COLUMN IF NOT EXISTS telegram_enabled boolean NOT NULL DEFAULT true;

-- 2) Teams: Topic thread ID + bật/tắt
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS telegram_topic_id text,
  ADD COLUMN IF NOT EXISTS telegram_enabled boolean NOT NULL DEFAULT false;

-- 3) Cấu hình Telegram dùng chung (singleton, server-only)
CREATE TABLE IF NOT EXISTS public.telegram_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  bot_token text,
  group_chat_id text NOT NULL DEFAULT '-1002041537249',
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Không GRANT cho anon/authenticated: token chỉ đọc được bằng service role phía server.
REVOKE ALL ON public.telegram_config FROM anon, authenticated;
GRANT ALL ON public.telegram_config TO service_role;
ALTER TABLE public.telegram_config ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_telegram_config_updated_at ON public.telegram_config;
CREATE TRIGGER set_telegram_config_updated_at
BEFORE UPDATE ON public.telegram_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.telegram_config (id, group_chat_id)
VALUES (true, '-1002041537249')
ON CONFLICT (id) DO NOTHING;

-- 4) Chuyển dữ liệu ánh xạ cũ sang nguồn dữ liệu chính thức (không xóa dữ liệu cũ)
UPDATE public.profiles p
SET telegram_user_id = l.chat_id,
    telegram_enabled = l.is_active
FROM public.telegram_user_links l
WHERE l.user_id = p.id
  AND p.telegram_user_id IS NULL;

UPDATE public.teams t
SET telegram_topic_id = l.topic_id,
    telegram_enabled = (l.is_active AND l.topic_id IS NOT NULL)
FROM public.telegram_team_links l
WHERE l.team_id = t.id
  AND t.telegram_topic_id IS NULL;

-- 5) Ràng buộc: bật Telegram cho Team thì bắt buộc có Topic ID
CREATE OR REPLACE FUNCTION public.validate_team_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.telegram_topic_id IS NOT NULL AND btrim(NEW.telegram_topic_id) = '' THEN
    NEW.telegram_topic_id := NULL;
  END IF;
  IF NEW.telegram_enabled AND NEW.telegram_topic_id IS NULL THEN
    RAISE EXCEPTION 'Cần nhập Telegram Topic Thread ID trước khi bật gửi Telegram cho Team';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS validate_team_telegram_trg ON public.teams;
CREATE TRIGGER validate_team_telegram_trg
BEFORE INSERT OR UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.validate_team_telegram();

-- 6) Hàng đợi gửi dùng nguồn dữ liệu mới
CREATE OR REPLACE FUNCTION public.enqueue_telegram_user(_user uuid, _notification uuid, _message text, _dedupe text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _chat text;
BEGIN
  SELECT NULLIF(btrim(telegram_user_id), '') INTO _chat
  FROM public.profiles WHERE id = _user AND telegram_enabled;
  IF _chat IS NULL THEN RETURN; END IF;
  INSERT INTO public.telegram_outbox (notification_id, target_type, target_id, chat_id, message, dedupe_key)
  VALUES (_notification, 'user', _user, _chat, _message, 'user:' || _user::text || ':' || _dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_team_telegram(_team uuid, _message text, _dedupe text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _chat text; _topic text;
BEGIN
  IF _team IS NULL THEN RETURN; END IF;
  SELECT NULLIF(btrim(telegram_topic_id), '') INTO _topic
  FROM public.teams WHERE id = _team AND telegram_enabled;
  IF _topic IS NULL THEN RETURN; END IF;
  SELECT NULLIF(btrim(group_chat_id), '') INTO _chat FROM public.telegram_config WHERE id;
  IF _chat IS NULL THEN RETURN; END IF;
  INSERT INTO public.telegram_outbox (target_type, target_id, chat_id, topic_id, message, dedupe_key)
  VALUES ('team', _team, _chat, _topic, _message, 'team:' || _team::text || ':' || _dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
END; $$;