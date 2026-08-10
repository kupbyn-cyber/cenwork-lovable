-- Snapshot Team tại thời điểm gửi (thống kê lịch sử không đổi khi User chuyển Team)
ALTER TABLE public.recognitions
  ADD COLUMN sender_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN receiver_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

UPDATE public.recognitions r
   SET sender_team_id = (SELECT p.primary_team_id FROM public.profiles p WHERE p.id = r.sender_id),
       receiver_team_id = (SELECT p.primary_team_id FROM public.profiles p WHERE p.id = r.receiver_id)
 WHERE r.sender_team_id IS NULL AND r.receiver_team_id IS NULL;

CREATE INDEX recognitions_receiver_team_idx ON public.recognitions (receiver_team_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.stamp_recognition_teams()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT p.primary_team_id INTO NEW.sender_team_id FROM public.profiles p WHERE p.id = NEW.sender_id;
  SELECT p.primary_team_id INTO NEW.receiver_team_id FROM public.profiles p WHERE p.id = NEW.receiver_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recognition_stamp_teams
  BEFORE INSERT ON public.recognitions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_recognition_teams();

REVOKE ALL ON FUNCTION public.stamp_recognition_teams() FROM PUBLIC, anon, authenticated;

-- Tổng hợp ghi nhận: chỉ trả số lượng, không trả nội dung/người gửi.
CREATE OR REPLACE FUNCTION public.recognition_stats(
  _from date,
  _to date,
  _team uuid DEFAULT NULL,
  _user uuid DEFAULT NULL,
  _category public.recognition_category DEFAULT NULL
)
RETURNS TABLE (
  receiver_id uuid,
  display_name text,
  team_id uuid,
  team_name text,
  support_count integer,
  quality_count integer,
  speed_count integer,
  initiative_count integer,
  teamwork_count integer,
  total_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _lead uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  _lead := public.leader_team_id(_me);

  -- Chặn truy vấn vượt phạm vi ngay tại máy chủ.
  IF NOT public.is_system_admin(_me) THEN
    IF _lead IS NULL THEN
      IF _user IS DISTINCT FROM _me THEN
        _user := _me;
      END IF;
      _team := NULL;
    ELSE
      IF _team IS NOT NULL AND _team <> _lead THEN
        RAISE EXCEPTION 'Bạn chỉ xem được thống kê Team mình quản lý.';
      END IF;
      _team := _lead;
    END IF;
  END IF;

  RETURN QUERY
  SELECT r.receiver_id,
         p.display_name,
         r.receiver_team_id AS team_id,
         t.name AS team_name,
         count(*) FILTER (WHERE r.category = 'support')::int,
         count(*) FILTER (WHERE r.category = 'quality')::int,
         count(*) FILTER (WHERE r.category = 'speed')::int,
         count(*) FILTER (WHERE r.category = 'initiative')::int,
         count(*) FILTER (WHERE r.category = 'teamwork')::int,
         count(*)::int
    FROM public.recognitions r
    JOIN public.profiles p ON p.id = r.receiver_id
    LEFT JOIN public.teams t ON t.id = r.receiver_team_id
   WHERE r.revoked_at IS NULL
     AND (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN _from AND _to
     AND (_category IS NULL OR r.category = _category)
     AND (_team IS NULL OR r.receiver_team_id = _team)
     AND (_user IS NULL OR r.receiver_id = _user)
     AND (
       public.is_system_admin(_me)
       OR (_lead IS NOT NULL AND r.receiver_team_id = _lead)
       OR r.receiver_id = _me
     )
   GROUP BY r.receiver_id, p.display_name, r.receiver_team_id, t.name
   ORDER BY count(*) DESC, p.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.recognition_stats(date, date, uuid, uuid, public.recognition_category) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recognition_stats(date, date, uuid, uuid, public.recognition_category) TO authenticated;