-- ============ Peer Recognition (CEN TODAY-02) ============
CREATE TYPE public.recognition_category AS ENUM ('support','quality','speed','initiative','teamwork');
CREATE TYPE public.recognition_report_status AS ENUM ('open','dismissed','actioned');

CREATE TABLE public.recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category public.recognition_category NOT NULL,
  message text NOT NULL,
  relation_type text NOT NULL DEFAULT 'unknown',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recognitions_no_self CHECK (sender_id <> receiver_id),
  CONSTRAINT recognitions_message_len CHECK (char_length(btrim(message)) BETWEEN 10 AND 280)
);

GRANT SELECT, INSERT, UPDATE ON public.recognitions TO authenticated;
GRANT ALL ON public.recognitions TO service_role;
ALTER TABLE public.recognitions ENABLE ROW LEVEL SECURITY;

CREATE INDEX recognitions_receiver_idx ON public.recognitions (receiver_id, created_at DESC);
CREATE INDEX recognitions_sender_idx ON public.recognitions (sender_id, created_at DESC);
CREATE INDEX recognitions_created_idx ON public.recognitions (created_at DESC);

-- 1 lời ghi nhận cho cùng một người nhận mỗi ngày (giờ Hà Nội)
CREATE UNIQUE INDEX recognitions_one_per_pair_per_day
  ON public.recognitions (sender_id, receiver_id, ((created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date));

CREATE TABLE public.recognition_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recognition_id uuid NOT NULL REFERENCES public.recognitions(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status public.recognition_report_status NOT NULL DEFAULT 'open',
  handled_by uuid REFERENCES public.profiles(id),
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recognition_reports_reason_len CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  CONSTRAINT recognition_reports_unique UNIQUE (recognition_id, reporter_id)
);

GRANT SELECT, INSERT, UPDATE ON public.recognition_reports TO authenticated;
GRANT ALL ON public.recognition_reports TO service_role;
ALTER TABLE public.recognition_reports ENABLE ROW LEVEL SECURITY;

-- ---------- quan hệ làm việc hợp lệ ----------
CREATE OR REPLACE FUNCTION public.can_recognize(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _target IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND _target <> auth.uid()
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _target AND p.status = 'active')
     AND (
       public.is_system_admin(auth.uid())
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
            SELECT 1 FROM public.project_members a
            JOIN public.project_members b ON b.project_id = a.project_id
            WHERE a.user_id = auth.uid() AND b.user_id = _target)
       OR EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE (t.assignee_id = auth.uid() AND EXISTS (SELECT 1 FROM public.task_participants tp WHERE tp.task_id = t.id AND tp.user_id = _target))
               OR (t.assignee_id = _target AND EXISTS (SELECT 1 FROM public.task_participants tp WHERE tp.task_id = t.id AND tp.user_id = auth.uid())))
     )
$$;

CREATE OR REPLACE FUNCTION public.recognition_quota_left()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, 3 - (
    SELECT count(*)::int FROM public.recognitions r
    WHERE r.sender_id = auth.uid()
      AND (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  ))
$$;

-- ---------- ràng buộc khi tạo ----------
CREATE OR REPLACE FUNCTION public.enforce_recognition_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Chỉ được gửi ghi nhận dưới danh nghĩa chính mình.';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.can_recognize(NEW.receiver_id) THEN
    RAISE EXCEPTION 'Bạn chưa có quan hệ làm việc hợp lệ với người này.';
  END IF;
  SELECT count(*) INTO _count FROM public.recognitions r
   WHERE r.sender_id = NEW.sender_id
     AND (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
       = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF _count >= 3 THEN
    RAISE EXCEPTION 'Bạn đã dùng hết 3 lượt ghi nhận trong ngày.';
  END IF;
  NEW.revoked_at := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recognition_insert
  BEFORE INSERT ON public.recognitions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_recognition_insert();

-- ---------- chỉ cho thu hồi trong 10 phút ----------
CREATE OR REPLACE FUNCTION public.enforce_recognition_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_system_admin(auth.uid()) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.sender_id <> OLD.sender_id OR NEW.receiver_id <> OLD.receiver_id
     OR NEW.message <> OLD.message OR NEW.category <> OLD.category
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Nội dung ghi nhận không được chỉnh sửa.';
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Lời ghi nhận đã được thu hồi.';
  END IF;
  IF NEW.revoked_at IS NOT NULL AND now() - OLD.created_at > interval '10 minutes' THEN
    RAISE EXCEPTION 'Đã quá 10 phút nên không thể thu hồi.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recognition_update
  BEFORE UPDATE ON public.recognitions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_recognition_update();

-- ---------- thông báo + audit ----------
CREATE OR REPLACE FUNCTION public.notify_recognition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _sender text;
BEGIN
  SELECT display_name INTO _sender FROM public.profiles WHERE id = NEW.sender_id;
  PERFORM public.notify_user(
    NEW.receiver_id,
    'recognition.received',
    COALESCE(_sender, 'Đồng đội') || ' đã ghi nhận bạn',
    left(NEW.message, 200),
    'recognition', NEW.id, '/recognitions',
    'recognition.received:' || NEW.id::text);
  PERFORM public.write_audit('recognition.created', 'recognition', NEW.id, NULL,
    jsonb_build_object('sender_id', NEW.sender_id, 'receiver_id', NEW.receiver_id,
                       'category', NEW.category), '{}'::jsonb);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recognition_notify
  AFTER INSERT ON public.recognitions
  FOR EACH ROW EXECUTE FUNCTION public.notify_recognition();

CREATE OR REPLACE FUNCTION public.audit_recognition_revoke()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    PERFORM public.write_audit('recognition.revoked', 'recognition', NEW.id,
      to_jsonb(OLD), to_jsonb(NEW), '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recognition_revoke_audit
  AFTER UPDATE ON public.recognitions
  FOR EACH ROW EXECUTE FUNCTION public.audit_recognition_revoke();

CREATE TRIGGER trg_recognition_reports_updated
  BEFORE UPDATE ON public.recognition_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- RLS ----------
CREATE POLICY "recognitions_select" ON public.recognitions
  FOR SELECT TO authenticated
  USING (revoked_at IS NULL OR sender_id = auth.uid() OR public.is_system_admin(auth.uid()));

CREATE POLICY "recognitions_insert" ON public.recognitions
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.can_recognize(receiver_id));

CREATE POLICY "recognitions_update" ON public.recognitions
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR public.is_system_admin(auth.uid()))
  WITH CHECK (sender_id = auth.uid() OR public.is_system_admin(auth.uid()));

CREATE POLICY "recognition_reports_select" ON public.recognition_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_system_admin(auth.uid()));

CREATE POLICY "recognition_reports_insert" ON public.recognition_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "recognition_reports_update" ON public.recognition_reports
  FOR UPDATE TO authenticated
  USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

-- ---------- quyền thực thi (mặc định đã bị thu hồi ở migration bảo mật) ----------
REVOKE ALL ON FUNCTION public.can_recognize(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recognition_quota_left() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_recognize(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recognition_quota_left() TO authenticated;
REVOKE ALL ON FUNCTION public.enforce_recognition_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_recognition_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_recognition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_recognition_revoke() FROM PUBLIC, anon, authenticated;