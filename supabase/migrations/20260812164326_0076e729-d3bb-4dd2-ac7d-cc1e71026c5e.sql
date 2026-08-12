-- WORKDAY-01 — Bắt đầu ngày làm việc.

CREATE TABLE IF NOT EXISTS public.daily_work_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  day_status text NOT NULL CHECK (day_status IN ('working','day_off')),
  shift_type text CHECK (shift_type IN ('full_day','morning','afternoon','evening','custom')),
  started_at timestamptz,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'popup',
  change_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT daily_work_records_user_day_key UNIQUE (user_id, work_date),
  CONSTRAINT daily_work_records_shift_check CHECK (
    (day_status = 'working' AND shift_type IS NOT NULL)
    OR (day_status = 'day_off' AND shift_type IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS daily_work_records_date_idx ON public.daily_work_records (work_date, user_id);

GRANT SELECT, INSERT, UPDATE ON public.daily_work_records TO authenticated;
GRANT ALL ON public.daily_work_records TO service_role;
ALTER TABLE public.daily_work_records ENABLE ROW LEVEL SECURITY;

-- Ngày hiện tại theo múi giờ nghiệp vụ CEN.
CREATE OR REPLACE FUNCTION public.cen_today()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
$$;
GRANT EXECUTE ON FUNCTION public.cen_today() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_work_record(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'cmo')
      OR EXISTS (
           SELECT 1 FROM public.teams t
            JOIN public.profiles p ON p.primary_team_id = t.id
           WHERE t.leader_id = auth.uid() AND p.id = _user
         );
$$;
GRANT EXECUTE ON FUNCTION public.can_view_work_record(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_work_record(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'cmo')
      OR EXISTS (
           SELECT 1 FROM public.teams t
            JOIN public.profiles p ON p.primary_team_id = t.id
           WHERE t.leader_id = auth.uid() AND p.id = _user
         );
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_work_record(uuid) TO authenticated;

DROP POLICY IF EXISTS daily_work_records_select ON public.daily_work_records;
CREATE POLICY daily_work_records_select ON public.daily_work_records
  FOR SELECT TO authenticated USING (public.can_view_work_record(user_id));

DROP POLICY IF EXISTS daily_work_records_insert ON public.daily_work_records;
CREATE POLICY daily_work_records_insert ON public.daily_work_records
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_work_record(user_id));

DROP POLICY IF EXISTS daily_work_records_update ON public.daily_work_records;
CREATE POLICY daily_work_records_update ON public.daily_work_records
  FOR UPDATE TO authenticated
  USING (public.can_manage_work_record(user_id))
  WITH CHECK (public.can_manage_work_record(user_id));

-- Trạng thái ngày làm việc hôm nay của chính người gọi.
CREATE OR REPLACE FUNCTION public.work_day_today()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _day date := public.cen_today(); _row public.daily_work_records;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO _row FROM public.daily_work_records WHERE user_id = _uid AND work_date = _day;
  RETURN jsonb_build_object(
    'work_date', _day,
    'confirmed', _row.id IS NOT NULL,
    'record', CASE WHEN _row.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _row.id, 'user_id', _row.user_id, 'work_date', _row.work_date,
      'day_status', _row.day_status, 'shift_type', _row.shift_type,
      'started_at', _row.started_at, 'confirmed_at', _row.confirmed_at,
      'source', _row.source, 'change_count', _row.change_count) END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.work_day_today() TO authenticated;

-- Xác nhận / cập nhật ngày làm việc. Không cho spoof user_id, luôn ghi audit.
CREATE OR REPLACE FUNCTION public.work_day_set(
  _status text,
  _shift text DEFAULT NULL,
  _user uuid DEFAULT NULL,
  _day date DEFAULT NULL,
  _source text DEFAULT 'popup'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _target uuid := coalesce(_user, auth.uid());
  _date date := coalesce(_day, public.cen_today());
  _before jsonb;
  _row public.daily_work_records;
  _shift_final text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  IF NOT public.can_manage_work_record(_target) THEN
    RAISE EXCEPTION 'Không có quyền ghi nhận ngày làm việc cho người này.';
  END IF;
  IF _status NOT IN ('working','day_off') THEN
    RAISE EXCEPTION 'Trạng thái ngày làm việc không hợp lệ.';
  END IF;
  IF _date > public.cen_today() THEN
    RAISE EXCEPTION 'Không ghi nhận ngày làm việc cho ngày trong tương lai.';
  END IF;

  _shift_final := CASE WHEN _status = 'working' THEN coalesce(_shift, 'full_day') ELSE NULL END;
  IF _shift_final IS NOT NULL AND _shift_final NOT IN ('full_day','morning','afternoon','evening','custom') THEN
    RAISE EXCEPTION 'Ca làm việc không hợp lệ.';
  END IF;

  SELECT to_jsonb(d) INTO _before FROM public.daily_work_records d
   WHERE d.user_id = _target AND d.work_date = _date;

  INSERT INTO public.daily_work_records AS d
    (user_id, work_date, day_status, shift_type, started_at, confirmed_at, source, updated_by)
  VALUES (_target, _date, _status, _shift_final,
          CASE WHEN _status = 'working' THEN now() ELSE NULL END,
          now(), coalesce(_source, 'popup'), _actor)
  ON CONFLICT (user_id, work_date) DO UPDATE
     SET day_status = EXCLUDED.day_status,
         shift_type = EXCLUDED.shift_type,
         -- Không backdate: giờ bắt đầu là lúc thực sự chuyển sang làm việc.
         started_at = CASE
           WHEN EXCLUDED.day_status <> 'working' THEN NULL
           WHEN d.day_status = 'working' AND d.started_at IS NOT NULL THEN d.started_at
           ELSE now() END,
         confirmed_at = now(),
         source = EXCLUDED.source,
         change_count = d.change_count + 1,
         updated_by = _actor,
         updated_at = now()
  RETURNING * INTO _row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, result, before_data, after_data, metadata)
  VALUES (_actor,
          CASE WHEN _before IS NULL THEN 'work_day_confirm' ELSE 'work_day_change' END,
          'daily_work_records', _row.id, 'success',
          _before,
          jsonb_build_object('day_status', _row.day_status, 'shift_type', _row.shift_type,
                             'started_at', _row.started_at, 'work_date', _row.work_date),
          jsonb_build_object('target_user', _target, 'source', coalesce(_source,'popup')));

  RETURN jsonb_build_object(
    'id', _row.id, 'user_id', _row.user_id, 'work_date', _row.work_date,
    'day_status', _row.day_status, 'shift_type', _row.shift_type,
    'started_at', _row.started_at, 'confirmed_at', _row.confirmed_at,
    'source', _row.source, 'change_count', _row.change_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.work_day_set(text, text, uuid, date, text) TO authenticated;