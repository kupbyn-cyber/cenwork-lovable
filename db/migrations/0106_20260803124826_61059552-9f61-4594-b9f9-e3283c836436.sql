-- 1. Thêm loại ghi nhận mới
ALTER TYPE public.recognition_category ADD VALUE IF NOT EXISTS 'creativity';
ALTER TYPE public.recognition_category ADD VALUE IF NOT EXISTS 'effectiveness';
ALTER TYPE public.recognition_category ADD VALUE IF NOT EXISTS 'progress';
ALTER TYPE public.recognition_category ADD VALUE IF NOT EXISTS 'dedication';

-- 2. Cho phép tự ghi nhận
ALTER TABLE public.recognitions DROP CONSTRAINT IF EXISTS recognitions_no_self;

CREATE OR REPLACE FUNCTION public.recognition_actor_active(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _user AND p.status = 'active' AND p.locked_at IS NULL
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_recognize(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _target IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND public.recognition_actor_active(auth.uid())
     AND public.recognition_actor_active(_target)
     AND (
       _target = auth.uid()
       OR public.is_system_admin(auth.uid())
       OR EXISTS (SELECT 1 FROM public.teams t WHERE t.leader_id = auth.uid()
                    AND (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _target AND p.primary_team_id = t.id)
                         OR EXISTS (SELECT 1 FROM public.team_collaborators tc WHERE tc.team_id = t.id AND tc.user_id = _target)))
       OR EXISTS (
            SELECT 1 FROM public.profiles me, public.profiles other
            WHERE me.id = auth.uid() AND other.id = _target
              AND me.primary_team_id IS NOT NULL
              AND me.primary_team_id = other.primary_team_id)
       OR EXISTS (
            SELECT 1 FROM public.team_collaborators a
            JOIN public.team_collaborators b ON b.team_id = a.team_id
            WHERE a.user_id = auth.uid() AND b.user_id = _target)
       OR EXISTS (
            SELECT 1 FROM public.team_collaborators a
            JOIN public.profiles other ON other.primary_team_id = a.team_id
            WHERE a.user_id = auth.uid() AND other.id = _target)
       OR EXISTS (
            SELECT 1 FROM public.profiles me
            JOIN public.team_collaborators b ON b.team_id = me.primary_team_id
            WHERE me.id = auth.uid() AND b.user_id = _target)
       OR EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE (t.assignee_id = auth.uid() AND EXISTS (SELECT 1 FROM public.task_participants tp WHERE tp.task_id = t.id AND tp.user_id = _target))
               OR (t.assignee_id = _target AND EXISTS (SELECT 1 FROM public.task_participants tp WHERE tp.task_id = t.id AND tp.user_id = auth.uid())))
     )
$function$;

-- 3. Không thông báo / không Telegram khi tự ghi nhận
CREATE OR REPLACE FUNCTION public.notify_recognition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _sender text;
BEGIN
  IF NEW.sender_id <> NEW.receiver_id THEN
    SELECT display_name INTO _sender FROM public.profiles WHERE id = NEW.sender_id;
    PERFORM public.notify_user(
      NEW.receiver_id,
      'recognition.received',
      COALESCE(_sender, 'Đồng đội') || ' đã ghi nhận bạn',
      left(NEW.message, 200),
      'recognition', NEW.id, '/recognitions',
      'recognition.received:' || NEW.id::text);
  END IF;
  PERFORM public.write_audit('recognition.created', 'recognition', NEW.id, NULL,
    jsonb_build_object('sender_id', NEW.sender_id, 'receiver_id', NEW.receiver_id,
                       'category', NEW.category,
                       'is_self', NEW.sender_id = NEW.receiver_id), '{}'::jsonb);
  RETURN NEW;
END;
$function$;

-- 4. Bảng cảm xúc
CREATE TABLE IF NOT EXISTS public.recognition_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recognition_id uuid NOT NULL REFERENCES public.recognitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('❤️', '👏', '🔥', '💚')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recognition_id, user_id)
);

CREATE INDEX IF NOT EXISTS recognition_reactions_recognition_idx
  ON public.recognition_reactions (recognition_id);

GRANT SELECT ON public.recognition_reactions TO authenticated;
GRANT ALL ON public.recognition_reactions TO service_role;

ALTER TABLE public.recognition_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recognition_reactions_select ON public.recognition_reactions;
CREATE POLICY recognition_reactions_select ON public.recognition_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recognitions r WHERE r.id = recognition_id));

CREATE OR REPLACE FUNCTION public.recognition_react(_recognition uuid, _emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  IF NOT public.recognition_actor_active(_me) THEN
    RAISE EXCEPTION 'Tài khoản đã bị khóa nên không thể bày tỏ cảm xúc.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recognitions r WHERE r.id = _recognition AND r.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Lời ghi nhận không tồn tại hoặc đã thu hồi.';
  END IF;

  IF _emoji IS NULL THEN
    DELETE FROM public.recognition_reactions
     WHERE recognition_id = _recognition AND user_id = _me;
    RETURN;
  END IF;

  IF _emoji NOT IN ('❤️', '👏', '🔥', '💚') THEN
    RAISE EXCEPTION 'Cảm xúc không hợp lệ.';
  END IF;

  INSERT INTO public.recognition_reactions (recognition_id, user_id, emoji)
  VALUES (_recognition, _me, _emoji)
  ON CONFLICT (recognition_id, user_id)
  DO UPDATE SET emoji = EXCLUDED.emoji, updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.recognition_react(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recognition_react(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.recognition_actor_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recognition_actor_active(uuid) TO authenticated;

-- 5. Thống kê tuần theo Team ("Không ai bị bỏ quên")
CREATE OR REPLACE FUNCTION public.recognition_team_pulse(_team uuid DEFAULT NULL)
RETURNS TABLE(
  team_id uuid,
  team_name text,
  total_count integer,
  self_count integer,
  peer_recognized_members integer,
  active_members integer,
  missing_members integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
  _scope uuid;
  _from date;
  _to date;
  _today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  _scope := _team;
  IF _scope IS NULL THEN
    _scope := COALESCE(public.leader_team_id(_me),
                       (SELECT p.primary_team_id FROM public.profiles p WHERE p.id = _me));
  ELSIF NOT public.is_system_admin(_me)
        AND _scope IS DISTINCT FROM public.leader_team_id(_me)
        AND _scope IS DISTINCT FROM (SELECT p.primary_team_id FROM public.profiles p WHERE p.id = _me) THEN
    RAISE EXCEPTION 'Bạn không xem được thống kê của Team này.';
  END IF;

  IF _scope IS NULL THEN
    RETURN;
  END IF;

  _from := _today - ((EXTRACT(ISODOW FROM _today)::int) - 1);
  _to := _from + 6;

  RETURN QUERY
  WITH members AS (
    SELECT p.id
      FROM public.profiles p
     WHERE p.primary_team_id = _scope
       AND p.status = 'active'
       AND p.locked_at IS NULL
  ),
  week_rows AS (
    SELECT r.receiver_id, r.sender_id
      FROM public.recognitions r
     WHERE r.revoked_at IS NULL
       AND r.receiver_team_id = _scope
       AND (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN _from AND _to
  )
  SELECT _scope,
         (SELECT t.name FROM public.teams t WHERE t.id = _scope),
         (SELECT count(*)::int FROM week_rows),
         (SELECT count(*)::int FROM week_rows w WHERE w.sender_id = w.receiver_id),
         (SELECT count(DISTINCT w.receiver_id)::int FROM week_rows w
           JOIN members m ON m.id = w.receiver_id
          WHERE w.sender_id <> w.receiver_id),
         (SELECT count(*)::int FROM members),
         GREATEST(0,
           (SELECT count(*)::int FROM members)
           - (SELECT count(DISTINCT w.receiver_id)::int FROM week_rows w
               JOIN members m ON m.id = w.receiver_id
              WHERE w.sender_id <> w.receiver_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.recognition_team_pulse(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recognition_team_pulse(uuid) TO authenticated;