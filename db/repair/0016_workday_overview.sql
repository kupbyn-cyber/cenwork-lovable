-- WORKDAY-02 — Thống kê ngày làm việc (chỉ đọc, không đổi business rule WORKDAY-01).

-- Người xem có quyền xem thống kê ngày làm việc của người khác hay không.
CREATE OR REPLACE FUNCTION public.work_day_can_view_dashboard()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'cmo')
      OR EXISTS (SELECT 1 FROM public.teams t WHERE t.leader_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.work_day_can_view_dashboard() TO authenticated;

-- Tổng hợp theo người trong khoảng ngày. Phạm vi chốt trong hàm (không phụ thuộc UI).
CREATE OR REPLACE FUNCTION public.work_day_overview(
  _from date,
  _to date,
  _team uuid DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  team_id uuid,
  team_name text,
  avatar_path text,
  working_days integer,
  full_days integer,
  other_shift_days integer,
  weekend_days integer,
  day_off_days integer,
  change_count integer,
  today_status text,
  today_shift text,
  today_started_at timestamptz,
  today_changed boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _org boolean;
  _today date := public.cen_today();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'Khoảng thời gian không hợp lệ.';
  END IF;
  IF NOT public.work_day_can_view_dashboard() THEN
    RAISE EXCEPTION 'Không có quyền xem thống kê ngày làm việc.';
  END IF;

  _org := public.has_role(_uid, 'admin') OR public.has_role(_uid, 'cmo');

  RETURN QUERY
  WITH scope AS (
    SELECT p.id, p.display_name, p.primary_team_id, p.avatar_path
      FROM public.profiles p
     WHERE p.status = 'active'
       AND (
         _org
         OR EXISTS (SELECT 1 FROM public.teams t
                     WHERE t.leader_id = _uid AND t.id = p.primary_team_id)
       )
       AND (_team IS NULL OR p.primary_team_id = _team)
  ),
  agg AS (
    SELECT d.user_id,
           count(*) FILTER (WHERE d.day_status = 'working')::int AS working_days,
           count(*) FILTER (WHERE d.day_status = 'working' AND d.shift_type = 'full_day')::int AS full_days,
           count(*) FILTER (WHERE d.day_status = 'working' AND d.shift_type <> 'full_day')::int AS other_shift_days,
           count(*) FILTER (WHERE d.day_status = 'working'
                              AND EXTRACT(ISODOW FROM d.work_date) IN (6,7))::int AS weekend_days,
           count(*) FILTER (WHERE d.day_status = 'day_off')::int AS day_off_days,
           coalesce(sum(d.change_count), 0)::int AS change_count
      FROM public.daily_work_records d
     WHERE d.work_date BETWEEN _from AND _to
     GROUP BY d.user_id
  ),
  today AS (
    SELECT d.user_id, d.day_status, d.shift_type, d.started_at, d.change_count
      FROM public.daily_work_records d
     WHERE d.work_date = _today
  )
  SELECT s.id, s.display_name, s.primary_team_id, t.name, s.avatar_path,
         coalesce(a.working_days, 0), coalesce(a.full_days, 0), coalesce(a.other_shift_days, 0),
         coalesce(a.weekend_days, 0), coalesce(a.day_off_days, 0), coalesce(a.change_count, 0),
         td.day_status, td.shift_type, td.started_at, coalesce(td.change_count, 0) > 0
    FROM scope s
    LEFT JOIN public.teams t ON t.id = s.primary_team_id
    LEFT JOIN agg a ON a.user_id = s.id
    LEFT JOIN today td ON td.user_id = s.id
   ORDER BY s.display_name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.work_day_overview(date, date, uuid) TO authenticated;

-- Lịch sử ngày làm việc của một nhân sự trong khoảng ngày.
CREATE OR REPLACE FUNCTION public.work_day_history(
  _user uuid,
  _from date,
  _to date
)
RETURNS TABLE(
  id uuid,
  work_date date,
  day_status text,
  shift_type text,
  started_at timestamptz,
  confirmed_at timestamptz,
  change_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  IF NOT public.can_view_work_record(_user) THEN
    RAISE EXCEPTION 'Không có quyền xem ngày làm việc của người này.';
  END IF;
  RETURN QUERY
  SELECT d.id, d.work_date, d.day_status, d.shift_type, d.started_at, d.confirmed_at, d.change_count
    FROM public.daily_work_records d
   WHERE d.user_id = _user AND d.work_date BETWEEN _from AND _to
   ORDER BY d.work_date DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.work_day_history(uuid, date, date) TO authenticated;

-- Lịch sử thay đổi của một bản ghi ngày làm việc (đọc lại Audit Log của WORKDAY-01).
CREATE OR REPLACE FUNCTION public.work_day_changes(_record uuid)
RETURNS TABLE(
  changed_at timestamptz,
  actor_name text,
  before_status text,
  before_shift text,
  after_status text,
  after_shift text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  SELECT d.user_id INTO _owner FROM public.daily_work_records d WHERE d.id = _record;
  IF _owner IS NULL THEN RETURN; END IF;
  IF NOT public.can_manage_work_record(_owner) THEN
    RAISE EXCEPTION 'Không có quyền xem lịch sử thay đổi.';
  END IF;
  RETURN QUERY
  SELECT l.created_at,
         coalesce(p.display_name, '—'),
         l.before_data ->> 'day_status',
         l.before_data ->> 'shift_type',
         l.after_data ->> 'day_status',
         l.after_data ->> 'shift_type'
    FROM public.audit_logs l
    LEFT JOIN public.profiles p ON p.id = l.user_id
   WHERE l.entity_type = 'daily_work_records' AND l.entity_id = _record
   ORDER BY l.created_at DESC
   LIMIT 50;
END;
$$;
GRANT EXECUTE ON FUNCTION public.work_day_changes(uuid) TO authenticated;
