-- ============ 1. TABLES ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  link text,
  event_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, event_key)
);
CREATE INDEX idx_notifications_recipient ON public.notifications (recipient_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

CREATE TABLE public.telegram_user_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_user_links TO authenticated;
GRANT ALL ON public.telegram_user_links TO service_role;
ALTER TABLE public.telegram_user_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_user_links_admin_all" ON public.telegram_user_links
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.telegram_team_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  topic_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_team_links TO authenticated;
GRANT ALL ON public.telegram_team_links TO service_role;
ALTER TABLE public.telegram_team_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_team_links_admin_all" ON public.telegram_team_links
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TYPE public.delivery_status AS ENUM ('pending','sent','failed');

CREATE TABLE public.telegram_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('user','team')),
  target_id uuid,
  chat_id text NOT NULL,
  topic_id text,
  message text NOT NULL,
  status public.delivery_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telegram_outbox_status ON public.telegram_outbox (status, created_at);
GRANT SELECT ON public.telegram_outbox TO authenticated;
GRANT ALL ON public.telegram_outbox TO service_role;
ALTER TABLE public.telegram_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_outbox_admin_select" ON public.telegram_outbox
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_tg_user_links_updated BEFORE UPDATE ON public.telegram_user_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tg_team_links_updated BEFORE UPDATE ON public.telegram_team_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tg_outbox_updated BEFORE UPDATE ON public.telegram_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Không cho phép sửa nội dung thông báo ngoài trạng thái đọc
CREATE OR REPLACE FUNCTION public.enforce_notification_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  NEW.id := OLD.id; NEW.recipient_id := OLD.recipient_id; NEW.event_type := OLD.event_type;
  NEW.title := OLD.title; NEW.body := OLD.body; NEW.entity_type := OLD.entity_type;
  NEW.entity_id := OLD.entity_id; NEW.link := OLD.link; NEW.event_key := OLD.event_key;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notifications_guard BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_update();

-- Audit khi thay đổi mapping Telegram (không ghi chat id đầy đủ)
CREATE OR REPLACE FUNCTION public.audit_telegram_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _action text;
BEGIN
  IF TG_OP = 'DELETE' THEN _id := OLD.id; ELSE _id := NEW.id; END IF;
  _action := 'telegram.mapping_' || lower(TG_OP);
  PERFORM public.write_audit(_action, TG_TABLE_NAME, _id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('is_active', OLD.is_active) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object('is_active', NEW.is_active) END,
    '{}'::jsonb);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_audit_tg_user_links AFTER INSERT OR UPDATE OR DELETE ON public.telegram_user_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_telegram_link();
CREATE TRIGGER trg_audit_tg_team_links AFTER INSERT OR UPDATE OR DELETE ON public.telegram_team_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_telegram_link();

-- ============ 2. HELPERS ============
CREATE OR REPLACE FUNCTION public.enqueue_telegram_user(_user uuid, _notification uuid, _message text, _dedupe text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _chat text;
BEGIN
  SELECT chat_id INTO _chat FROM public.telegram_user_links WHERE user_id = _user AND is_active;
  IF _chat IS NULL THEN RETURN; END IF;
  INSERT INTO public.telegram_outbox (notification_id, target_type, target_id, chat_id, message, dedupe_key)
  VALUES (_notification, 'user', _user, _chat, _message, 'user:' || _user::text || ':' || _dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_team_telegram(_team uuid, _message text, _dedupe text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _chat text; _topic text;
BEGIN
  IF _team IS NULL THEN RETURN; END IF;
  SELECT chat_id, topic_id INTO _chat, _topic FROM public.telegram_team_links WHERE team_id = _team AND is_active;
  IF _chat IS NULL THEN RETURN; END IF;
  INSERT INTO public.telegram_outbox (target_type, target_id, chat_id, topic_id, message, dedupe_key)
  VALUES ('team', _team, _chat, _topic, _message, 'team:' || _team::text || ':' || _dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_user(
  _recipient uuid, _event_type text, _title text, _body text,
  _entity_type text, _entity_id uuid, _link text, _event_key text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF _recipient IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND _recipient = auth.uid() THEN RETURN; END IF;
  INSERT INTO public.notifications (recipient_id, event_type, title, body, entity_type, entity_id, link, event_key)
  VALUES (_recipient, _event_type, _title, _body, _entity_type, _entity_id, _link, _event_key)
  ON CONFLICT (recipient_id, event_key) DO NOTHING
  RETURNING id INTO _id;
  IF _id IS NULL THEN RETURN; END IF;
  PERFORM public.write_audit('notification.created', 'notification', _id, NULL,
    jsonb_build_object('recipient_id', _recipient, 'event_type', _event_type,
                       'entity_type', _entity_type, 'entity_id', _entity_id), '{}'::jsonb);
  PERFORM public.enqueue_telegram_user(_recipient, _id,
    _title || CASE WHEN COALESCE(_body,'') = '' THEN '' ELSE E'\n' || _body END
           || CASE WHEN COALESCE(_link,'') = '' THEN '' ELSE E'\n' || _link END,
    _event_key);
END; $$;

REVOKE ALL ON FUNCTION public.notify_user(uuid,text,text,text,text,uuid,text,text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_telegram_user(uuid,uuid,text,text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_team_telegram(uuid,text,text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_notification_update() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_telegram_link() FROM anon, authenticated;

-- ============ 3. EVENT TRIGGERS ============
CREATE OR REPLACE FUNCTION public.notify_task_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _link text; _leader uuid; _owner uuid; _stamp text;
BEGIN
  _link := '/tasks/' || NEW.id::text;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.assignee_id, 'task.assigned', 'Bạn được giao công việc mới',
      NEW.name, 'task', NEW.id, _link, 'task.assigned:' || NEW.id::text);
    PERFORM public.notify_team_telegram(NEW.team_id,
      'Công việc mới: ' || NEW.name, 'task.assigned:' || NEW.id::text);
    RETURN NEW;
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    PERFORM public.notify_user(NEW.assignee_id, 'task.assignee_changed', 'Bạn được chuyển phụ trách công việc',
      NEW.name, 'task', NEW.id, _link, 'task.assignee_changed:' || NEW.id::text || ':' || NEW.assignee_id::text);
  END IF;

  IF NEW.deadline IS DISTINCT FROM OLD.deadline THEN
    _stamp := to_char(NEW.deadline AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI');
    PERFORM public.notify_user(NEW.assignee_id, 'task.deadline_changed', 'Deadline công việc đã thay đổi',
      NEW.name || ' — deadline mới: ' || _stamp, 'task', NEW.id, _link,
      'task.deadline_changed:' || NEW.id::text || ':' || extract(epoch from NEW.deadline)::bigint::text);
  END IF;

  IF NEW.status = 'review' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notify_user(NEW.created_by, 'task.review_requested', 'Công việc chờ kiểm tra',
      NEW.name, 'task', NEW.id, _link, 'task.review:' || NEW.id::text || ':' || NEW.created_by::text);
    IF NEW.team_id IS NOT NULL THEN
      SELECT leader_id INTO _leader FROM public.teams WHERE id = NEW.team_id;
      PERFORM public.notify_user(_leader, 'task.review_requested', 'Công việc chờ kiểm tra',
        NEW.name, 'task', NEW.id, _link, 'task.review:' || NEW.id::text || ':' || COALESCE(_leader::text,'none'));
    END IF;
    IF NEW.project_id IS NOT NULL THEN
      SELECT owner_id INTO _owner FROM public.projects WHERE id = NEW.project_id;
      PERFORM public.notify_user(_owner, 'task.review_requested', 'Công việc chờ kiểm tra',
        NEW.name, 'task', NEW.id, _link, 'task.review:' || NEW.id::text || ':' || COALESCE(_owner::text,'none'));
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_task_events() FROM anon, authenticated;
CREATE TRIGGER trg_notify_task AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_events();

CREATE OR REPLACE FUNCTION public.notify_daily_report_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _link text; _author_name text; _reviewer uuid; _author_is_leader boolean;
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
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_daily_report_events() FROM anon, authenticated;
CREATE TRIGGER trg_notify_daily_report AFTER INSERT OR UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_daily_report_events();

CREATE OR REPLACE FUNCTION public.notify_weekly_report_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _link text; _team_name text; _reviewer uuid;
BEGIN
  _link := '/reports/weekly/' || NEW.id::text;
  SELECT name INTO _team_name FROM public.teams WHERE id = NEW.team_id;

  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submitted') THEN
    FOR _reviewer IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('cmo','admin') LOOP
      PERFORM public.notify_user(_reviewer, 'report.weekly_submitted', 'Báo cáo tuần chờ duyệt',
        COALESCE(_team_name,'Team') || ' — tuần ' || to_char(NEW.week_start,'DD/MM/YYYY'),
        'weekly_report', NEW.id, _link,
        'report.weekly_submitted:' || NEW.id::text || ':' || COALESCE(NEW.submitted_at, now())::date::text || ':' || _reviewer::text);
    END LOOP;
    PERFORM public.notify_team_telegram(NEW.team_id,
      'Báo cáo tuần đã gửi duyệt: ' || COALESCE(_team_name,'Team') || ' — tuần ' || to_char(NEW.week_start,'DD/MM/YYYY'),
      'report.weekly_submitted:' || NEW.id::text || ':' || COALESCE(NEW.submitted_at, now())::date::text);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'changes_requested' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notify_user(NEW.leader_id, 'report.weekly_changes_requested', 'Báo cáo tuần cần chỉnh sửa',
      COALESCE(_team_name,'Team') || ' — tuần ' || to_char(NEW.week_start,'DD/MM/YYYY'),
      'weekly_report', NEW.id, _link,
      'report.weekly_changes:' || NEW.id::text || ':' || COALESCE(NEW.reviewed_at, now())::text);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_weekly_report_events() FROM anon, authenticated;
CREATE TRIGGER trg_notify_weekly_report AFTER INSERT OR UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_weekly_report_events();

CREATE OR REPLACE FUNCTION public.notify_project_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _link text; _approved boolean; _rejected boolean; _title text; _body text;
        _key text; _leader uuid; _r uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  _link := '/projects/' || NEW.id::text;
  _approved := (OLD.status = 'leader_review' AND NEW.status = 'proposal')
            OR (OLD.status = 'proposal' AND NEW.status = 'planning');
  _rejected := (OLD.status = 'leader_review' AND NEW.status = 'idea')
            OR (OLD.status = 'proposal' AND NEW.status = 'leader_review');
  IF NOT (_approved OR _rejected) THEN RETURN NEW; END IF;

  IF _approved THEN
    _title := 'Dự án được duyệt';
    _body := NEW.name;
  ELSE
    _title := 'Dự án bị từ chối';
    _body := NEW.name || CASE WHEN COALESCE(btrim(NEW.last_decision_note),'') = '' THEN ''
                              ELSE ' — ' || NEW.last_decision_note END;
  END IF;
  _key := 'project.decision:' || NEW.id::text || ':' || OLD.status::text || '->' || NEW.status::text;

  SELECT t.leader_id INTO _leader FROM public.teams t
   WHERE t.id = (SELECT primary_team_id FROM public.profiles WHERE id = NEW.created_by);

  FOREACH _r IN ARRAY ARRAY[NEW.created_by, NEW.owner_id, _leader] LOOP
    PERFORM public.notify_user(_r, CASE WHEN _approved THEN 'project.approved' ELSE 'project.rejected' END,
      _title, _body, 'project', NEW.id, _link, _key);
  END LOOP;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_project_events() FROM anon, authenticated;
CREATE TRIGGER trg_notify_project AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_project_events();

CREATE OR REPLACE FUNCTION public.notify_project_member_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text; _pid uuid; _uid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN _pid := NEW.project_id; _uid := NEW.user_id;
  ELSE _pid := OLD.project_id; _uid := OLD.user_id; END IF;
  SELECT name INTO _name FROM public.projects WHERE id = _pid;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(_uid, 'project.member_added', 'Bạn được thêm vào dự án',
      COALESCE(_name,'Dự án'), 'project', _pid, '/projects/' || _pid::text,
      'project.member_added:' || _pid::text || ':' || _uid::text);
    RETURN NEW;
  END IF;
  PERFORM public.notify_user(_uid, 'project.member_removed', 'Bạn đã rời khỏi dự án',
    COALESCE(_name,'Dự án'), 'project', _pid, NULL,
    'project.member_removed:' || _pid::text || ':' || _uid::text || ':' || floor(extract(epoch from now()))::text);
  RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.notify_project_member_events() FROM anon, authenticated;
CREATE TRIGGER trg_notify_project_member AFTER INSERT OR DELETE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_project_member_events();