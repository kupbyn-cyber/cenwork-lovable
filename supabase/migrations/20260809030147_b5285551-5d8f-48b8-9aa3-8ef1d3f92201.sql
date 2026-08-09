-- ============ 1. Base URL + Telegram formatting ============
INSERT INTO public.app_settings (key, value, description)
VALUES ('app_base_url', jsonb_build_object('text','https://cenwork.lovable.app'), 'Địa chỉ CEN dùng để dựng link đầy đủ trong Telegram')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.app_base_url()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(NULLIF(btrim((SELECT value->>'text' FROM public.app_settings WHERE key='app_base_url')),''),
                  'https://cenwork.lovable.app');
$$;

CREATE OR REPLACE FUNCTION public.telegram_icon(_event text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _event LIKE 'task.approval_approved%' THEN '✅'
    WHEN _event LIKE 'task.approval_changes%' THEN '📝'
    WHEN _event LIKE 'task.approval%' THEN '🕒'
    WHEN _event LIKE 'task.cancel%' THEN '🚫'
    WHEN _event LIKE 'task.deadline%' THEN '⏰'
    WHEN _event LIKE 'task.review%' THEN '🔍'
    WHEN _event LIKE 'task%' THEN '📌'
    WHEN _event LIKE 'project.owner%' THEN '👤'
    WHEN _event LIKE 'project%' THEN '📁'
    WHEN _event LIKE 'announcement.due%' THEN '⏰'
    WHEN _event LIKE 'announcement%' THEN '📢'
    WHEN _event LIKE 'report%' THEN '📊'
    WHEN _event LIKE 'approval%' THEN '🧾'
    WHEN _event LIKE 'document%' THEN '📄'
    WHEN _event LIKE 'recognition%' THEN '🎉'
    WHEN _event LIKE 'duty%' THEN '🗓️'
    WHEN _event LIKE 'mvp%' THEN '🏆'
    ELSE '🔔' END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_compose(_event text, _title text, _body text, _link text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.telegram_icon(COALESCE(_event,'')) || ' ' || COALESCE(NULLIF(btrim(_title),''),'Thông báo từ CEN')
      || CASE WHEN COALESCE(btrim(_body),'') = '' THEN '' ELSE E'\n' || btrim(_body) END
      || CASE WHEN COALESCE(btrim(_link),'') = '' THEN ''
              WHEN _link LIKE 'http%' THEN E'\n🔗 ' || btrim(_link)
              ELSE E'\n🔗 ' || public.app_base_url() || btrim(_link) END;
$$;

CREATE OR REPLACE FUNCTION public.notify_user(_recipient uuid, _event_type text, _title text, _body text, _entity_type text, _entity_id uuid, _link text, _event_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
    public.telegram_compose(_event_type, _title, _body, _link), _event_key);
END; $function$;

CREATE OR REPLACE FUNCTION public.report_notify(_recipient uuid, _event text, _title text, _body text, _entity_type text, _entity_id uuid, _link text, _event_key text, _telegram boolean DEFAULT false, _skip_actor boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _id uuid;
BEGIN
  IF _recipient IS NULL THEN RETURN; END IF;
  IF _skip_actor AND auth.uid() IS NOT NULL AND _recipient = auth.uid() THEN RETURN; END IF;
  INSERT INTO public.notifications (recipient_id, event_type, title, body, entity_type, entity_id, link, event_key)
  VALUES (_recipient, _event, _title, _body, _entity_type, _entity_id, _link, _event_key)
  ON CONFLICT (recipient_id, event_key) DO NOTHING
  RETURNING id INTO _id;
  IF _id IS NULL THEN RETURN; END IF;
  IF _telegram THEN
    BEGIN
      PERFORM public.enqueue_telegram_user(_recipient, _id,
        public.telegram_compose(_event, _title, _body, _link), _event_key);
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.write_audit('report.telegram_enqueue_failed','notification', _id, NULL,
        jsonb_build_object('recipient_id', _recipient, 'event', _event, 'error', SQLERRM), '{}'::jsonb);
    END;
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.enqueue_daily_report_telegram()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _chat text; _topic text; _author text; _team text; _msg text; _reviewer text;
  _lines text[]; _results text; _extra int;
BEGIN
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
        || E'\n' || '… còn ' || _extra || ' Task khác. Xem chi tiết trên CEN.';
    END IF;

    _msg := '📊 BÁO CÁO NGÀY ' || to_char(NEW.report_date, 'DD/MM/YYYY') || E'\n'
         || '👤 Người gửi: ' || COALESCE(_author, 'Thành viên') || E'\n'
         || '👥 Team: ' || COALESCE(_team, 'Chưa có Team') || E'\n\n'
         || '✅ Task hoàn thành:' || E'\n' || _results || E'\n\n'
         || '📈 ' || COALESCE(NULLIF(btrim(NEW.blockers), ''), 'Còn mở: 0 | Quá hạn: 0 | Chờ kiểm tra: 0') || E'\n\n'
         || '📝 Ghi chú: ' || COALESCE(NULLIF(btrim(NEW.next_plan), ''), 'Không có') || E'\n'
         || '🧾 Người duyệt: ' || COALESCE(_reviewer, 'Không xác định') || E'\n'
         || '🔗 ' || public.app_base_url() || '/reports/daily/' || NEW.id::text;

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

CREATE OR REPLACE FUNCTION public.notify_task_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _link text; _leader uuid; _owner uuid; _stamp text;
BEGIN
  _link := '/tasks/' || NEW.id::text;
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status <> 'approved' THEN RETURN NEW; END IF;
    PERFORM public.notify_user(NEW.assignee_id, 'task.assigned', 'Bạn được giao công việc mới',
      NEW.name, 'task', NEW.id, _link, 'task.assigned:' || NEW.id::text);
    PERFORM public.notify_team_telegram(NEW.team_id,
      public.telegram_compose('task.assigned', 'Công việc mới', NEW.name, _link),
      'task.assigned:' || NEW.id::text);
    RETURN NEW;
  END IF;

  IF NEW.approval_status <> 'approved' THEN RETURN NEW; END IF;

  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    PERFORM public.notify_user(NEW.assignee_id, 'task.assigned', 'Bạn được giao công việc mới',
      NEW.name, 'task', NEW.id, _link, 'task.assigned:' || NEW.id::text);
    PERFORM public.notify_team_telegram(NEW.team_id,
      public.telegram_compose('task.assigned', 'Công việc mới', NEW.name, _link),
      'task.assigned:' || NEW.id::text);
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
    IF NEW.reviewer_id IS NOT NULL THEN
      PERFORM public.notify_user(NEW.reviewer_id, 'task.review_requested', 'Công việc chờ bạn kiểm tra',
        NEW.name, 'task', NEW.id, _link, 'task.review:' || NEW.id::text || ':' || NEW.reviewer_id::text);
    END IF;
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
END; $function$;

-- ============ 2. Duyệt Task theo đúng Người duyệt ============
CREATE OR REPLACE FUNCTION public.can_approve_task_submission(_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (SELECT 1 FROM public.tasks t
                 WHERE t.id = _task AND t.reviewer_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        JOIN public.projects p ON p.id = t.project_id
        JOIN public.teams tm ON tm.id = p.responsible_team_id
        WHERE t.id = _task AND t.reviewer_id IS NULL AND tm.leader_id = auth.uid()
      );
$function$;

-- ============ 3. Chủ dự án giao việc cho người khác ============
DROP FUNCTION IF EXISTS public.task_member_submit(uuid, text, text, date, timestamptz, task_priority, uuid[], text, uuid);

CREATE OR REPLACE FUNCTION public.task_member_submit(
  _project uuid, _name text, _description text, _start_date date,
  _deadline timestamp with time zone, _priority task_priority,
  _participants uuid[] DEFAULT '{}'::uuid[], _reviewer_type text DEFAULT NULL::text,
  _reviewer uuid DEFAULT NULL::uuid, _assignee uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _team uuid; _task uuid;
        _rtype text := _reviewer_type; _rid uuid := _reviewer;
        _person uuid := COALESCE(_assignee, auth.uid());
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập'; END IF;
  IF public.perm_scope(_uid,'tasks.create') = 'none' THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo công việc';
  END IF;
  IF _project IS NULL THEN RAISE EXCEPTION 'Cần chọn dự án'; END IF;
  IF COALESCE(btrim(_name),'') = '' THEN RAISE EXCEPTION 'Nhập tên công việc'; END IF;
  IF _deadline IS NULL THEN RAISE EXCEPTION 'Nhập deadline'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND p.deleted_at IS NULL
                   AND p.status <> 'archived' AND p.manually_archived_at IS NULL) THEN
    RAISE EXCEPTION 'Dự án không khả dụng để tạo công việc';
  END IF;
  IF NOT public.is_project_approved(_project) THEN
    RAISE EXCEPTION 'Dự án chưa được duyệt';
  END IF;
  IF NOT (public.is_in_project_scope(_project, _uid)
          OR EXISTS (SELECT 1 FROM public.project_members pm
                     WHERE pm.project_id = _project AND pm.user_id = _uid)) THEN
    RAISE EXCEPTION 'Bạn không thuộc phạm vi dự án này';
  END IF;

  -- Giao cho người khác: chỉ Chủ dự án (hoặc Admin/CMO/Leader theo can_assign_task)
  IF _person <> _uid THEN
    IF NOT (public.is_in_project_scope(_project, _person)
            OR EXISTS (SELECT 1 FROM public.project_members pm
                       WHERE pm.project_id = _project AND pm.user_id = _person)) THEN
      RAISE EXCEPTION 'Người nhận việc không thuộc phạm vi dự án này';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = _person AND pr.status = 'active') THEN
      RAISE EXCEPTION 'Người nhận việc không còn hoạt động';
    END IF;
    IF NOT public.can_assign_task(_project, NULL, _person) THEN
      RAISE EXCEPTION 'Bạn chỉ được giao việc cho người khác khi là Chủ dự án, Leader hoặc Admin/CMO';
    END IF;
  END IF;

  IF _rtype IS NULL OR _rid IS NULL THEN
    SELECT c.kind, c.user_id INTO _rtype, _rid
    FROM public.task_reviewer_candidates(_project, _uid) c
    WHERE c.kind = 'project_owner' LIMIT 1;
  END IF;
  IF _rtype IS NULL OR _rid IS NULL THEN
    RAISE EXCEPTION 'Cần chọn Người duyệt hợp lệ';
  END IF;
  IF NOT public.task_reviewer_is_valid(_project, _rtype, _rid, _uid) THEN
    RAISE EXCEPTION 'Người duyệt không hợp lệ. Chỉ được chọn Chủ dự án, Leader của bạn hoặc CMO.';
  END IF;

  SELECT responsible_team_id INTO _team FROM public.projects WHERE id = _project;
  IF _team IS NULL THEN
    RAISE EXCEPTION 'Dự án chưa có Team phụ trách. Vui lòng liên hệ Admin/CMO để cập nhật.';
  END IF;

  PERFORM set_config('cen.task_approval','on',true);

  INSERT INTO public.tasks (name, description, project_id, assignee_id, team_id, start_date,
                            deadline, priority, status, created_by,
                            approval_status, approval_round, submitted_at,
                            reviewer_type, reviewer_id)
  VALUES (btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), _project, _person, _team, _start_date,
          _deadline, COALESCE(_priority,'medium'), 'not_started', _uid,
          'pending', 1, now(), _rtype, _rid)
  RETURNING id INTO _task;

  INSERT INTO public.task_participants (task_id, user_id)
  SELECT _task, u FROM unnest(COALESCE(_participants,'{}'::uuid[])) u
  WHERE u <> _person AND public.is_in_project_scope(_project, u)
  ON CONFLICT DO NOTHING;

  PERFORM public.task_log_approval_event(_task, 'submitted', 1, NULL);
  PERFORM public.write_audit('task.approval_requested','task',_task,NULL,
    jsonb_build_object('approval_status','pending','round',1), '{}'::jsonb);
  PERFORM public.task_submission_notify(_task);
  RETURN _task;
END $function$;

-- Gửi thông báo duyệt tới đúng Người duyệt đã chỉ định
CREATE OR REPLACE FUNCTION public.task_submission_notify(_task uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t record; _leader uuid; r record; _link text; _key text; _body text;
BEGIN
  SELECT tk.id, tk.name, tk.approval_round, tk.reviewer_id, p.name AS project_name, p.responsible_team_id
    INTO t
  FROM public.tasks tk JOIN public.projects p ON p.id = tk.project_id
  WHERE tk.id = _task;
  IF t.id IS NULL THEN RETURN; END IF;

  _link := '/tasks/' || _task::text;
  _body := t.name || ' — Dự án: ' || t.project_name;
  _key := 'task.approval_requested:' || _task::text || ':' || t.approval_round::text;

  IF t.reviewer_id IS NOT NULL THEN
    PERFORM public.notify_user(t.reviewer_id, 'task.approval_requested', 'Công việc chờ bạn phê duyệt',
      _body, 'task', _task, _link, _key || ':' || t.reviewer_id::text);
    RETURN;
  END IF;

  SELECT leader_id INTO _leader FROM public.teams WHERE id = t.responsible_team_id;
  IF _leader IS NOT NULL THEN
    PERFORM public.notify_user(_leader, 'task.approval_requested', 'Công việc chờ bạn phê duyệt',
      _body, 'task', _task, _link, _key || ':' || _leader::text);
  ELSE
    FOR r IN SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','cmo') LOOP
      PERFORM public.notify_user(r.user_id, 'task.approval_requested', 'Công việc chờ phê duyệt (Team chưa có Leader)',
        _body, 'task', _task, _link, _key || ':' || r.user_id::text);
    END LOOP;
  END IF;
END; $function$;

-- ============ 4. Xác nhận thông báo quá hạn ============
CREATE OR REPLACE FUNCTION public.announcement_acknowledge(_a uuid, _answers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _rec public.announcement_recipients; _ver integer; _q record;
        _entry jsonb; _opts uuid[]; _text text; _cnt integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF NOT public.announcement_is_active(_a) THEN
    RAISE EXCEPTION 'Thông báo không còn hiệu lực';
  END IF;
  SELECT * INTO _rec FROM public.announcement_recipients
   WHERE announcement_id = _a AND user_id = auth.uid();
  IF _rec.id IS NULL THEN RAISE EXCEPTION 'Bạn không thuộc danh sách người nhận'; END IF;
  IF _rec.status NOT IN ('unread','reading') THEN
    RAISE EXCEPTION 'Bạn đã hoàn thành hoặc được miễn thông báo này';
  END IF;
  _ver := public.announcement_current_version(_a);

  FOR _q IN SELECT * FROM public.announcement_questions
             WHERE announcement_id = _a AND version = _ver ORDER BY position LOOP
    SELECT value INTO _entry FROM jsonb_array_elements(COALESCE(_answers,'[]'::jsonb)) value
     WHERE value->>'question_id' = _q.id::text LIMIT 1;

    _opts := COALESCE((SELECT array_agg((v#>>'{}')::uuid)
                       FROM jsonb_array_elements(COALESCE(_entry->'option_ids','[]'::jsonb)) v), '{}'::uuid[]);
    _text := NULLIF(btrim(COALESCE(_entry->>'text','')), '');
    _cnt := COALESCE(array_length(_opts,1),0);

    IF _q.question_type = 'short' THEN
      IF _q.is_required AND _text IS NULL THEN
        RAISE EXCEPTION 'Câu hỏi bắt buộc chưa được trả lời';
      END IF;
      IF _text IS NOT NULL AND length(_text) > 1000 THEN
        RAISE EXCEPTION 'Câu trả lời ngắn tối đa 1.000 ký tự';
      END IF;
      _opts := '{}'::uuid[];
    ELSIF _q.question_type = 'single' THEN
      IF _q.is_required AND _cnt <> 1 THEN
        RAISE EXCEPTION 'Câu hỏi bắt buộc chưa được trả lời';
      END IF;
      IF _cnt > 1 THEN RAISE EXCEPTION 'Câu hỏi chỉ cho phép chọn một phương án'; END IF;
      _text := NULL;
    ELSE
      IF _q.is_required AND _cnt = 0 THEN
        RAISE EXCEPTION 'Câu hỏi bắt buộc chưa được trả lời';
      END IF;
      IF _cnt > 0 THEN
        IF _q.min_select IS NOT NULL AND _cnt < _q.min_select THEN
          RAISE EXCEPTION 'Phải chọn tối thiểu % phương án', _q.min_select;
        END IF;
        IF _q.max_select IS NOT NULL AND _cnt > _q.max_select THEN
          RAISE EXCEPTION 'Chỉ được chọn tối đa % phương án', _q.max_select;
        END IF;
      END IF;
      _text := NULL;
    END IF;

    IF _cnt > 0 AND EXISTS (
      SELECT 1 FROM unnest(_opts) oid
      WHERE NOT EXISTS (SELECT 1 FROM public.announcement_question_options o
                        WHERE o.id = oid AND o.question_id = _q.id)
    ) THEN
      RAISE EXCEPTION 'Phương án trả lời không hợp lệ';
    END IF;

    INSERT INTO public.announcement_answers
      (announcement_id, question_id, version, user_id, option_ids, text_answer, submitted_at)
    VALUES (_a, _q.id, _ver, auth.uid(), _opts, _text, now())
    ON CONFLICT (question_id, user_id, version)
    DO UPDATE SET option_ids = EXCLUDED.option_ids, text_answer = EXCLUDED.text_answer,
                  submitted_at = now(), updated_at = now()
    WHERE public.announcement_answers.submitted_at IS NULL;
  END LOOP;

  UPDATE public.announcement_recipients
     SET status = 'completed',
         read_completed_at = COALESCE(read_completed_at, now()),
         acknowledged_at = COALESCE(acknowledged_at, now()),
         is_late = (now() > due_at),
         updated_at = now()
   WHERE id = _rec.id AND status IN ('unread','reading');
END; $function$;

-- ============ 5. Đổi Chủ dự án có CMO phê duyệt ============
CREATE TABLE IF NOT EXISTS public.project_owner_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  current_owner_id uuid,
  proposed_owner_id uuid NOT NULL,
  reason text NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.project_owner_change_requests TO authenticated;
GRANT ALL ON public.project_owner_change_requests TO service_role;
ALTER TABLE public.project_owner_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view owner change requests" ON public.project_owner_change_requests;
CREATE POLICY "view owner change requests" ON public.project_owner_change_requests
FOR SELECT TO authenticated USING (public.can_view_project(project_id));

CREATE UNIQUE INDEX IF NOT EXISTS project_owner_change_one_pending
  ON public.project_owner_change_requests (project_id) WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_project_owner_change_updated ON public.project_owner_change_requests;
CREATE TRIGGER trg_project_owner_change_updated
BEFORE UPDATE ON public.project_owner_change_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.project_owner_change_request(_project uuid, _new_owner uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _owner uuid; _id uuid; _pname text; _clean text := NULLIF(btrim(COALESCE(_reason,'')),'');
        r record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập'; END IF;
  IF _clean IS NULL THEN RAISE EXCEPTION 'Cần nhập lý do đổi Chủ dự án'; END IF;
  SELECT owner_id, name INTO _owner, _pname FROM public.projects WHERE id = _project AND deleted_at IS NULL;
  IF _pname IS NULL THEN RAISE EXCEPTION 'Không tìm thấy dự án'; END IF;
  IF NOT (_owner = _uid OR public.has_role(_uid,'admin') OR public.has_role(_uid,'cmo')) THEN
    RAISE EXCEPTION 'Chỉ Chủ dự án hiện tại hoặc Admin/CMO được đề xuất đổi Chủ dự án';
  END IF;
  IF _new_owner IS NULL OR _new_owner = _owner THEN
    RAISE EXCEPTION 'Cần chọn Chủ dự án mới khác Chủ dự án hiện tại';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _new_owner AND status = 'active') THEN
    RAISE EXCEPTION 'Chủ dự án mới không còn hoạt động';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_owner_change_requests
             WHERE project_id = _project AND status = 'pending') THEN
    RAISE EXCEPTION 'Dự án đã có yêu cầu đổi Chủ dự án đang chờ CMO duyệt';
  END IF;

  INSERT INTO public.project_owner_change_requests
    (project_id, current_owner_id, proposed_owner_id, reason, requested_by)
  VALUES (_project, _owner, _new_owner, _clean, _uid)
  RETURNING id INTO _id;

  PERFORM public.write_audit('project.owner_change_requested','project',_project,NULL,
    jsonb_build_object('request_id',_id,'proposed_owner_id',_new_owner), '{}'::jsonb);

  FOR r IN SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('cmo','admin') LOOP
    PERFORM public.notify_user(r.user_id, 'project.owner_change_requested',
      'Yêu cầu đổi Chủ dự án chờ duyệt',
      _pname || ' — Chủ dự án đề xuất: ' || (SELECT display_name FROM public.profiles WHERE id = _new_owner),
      'project', _project, '/projects/' || _project::text,
      'project.owner_change_requested:' || _id::text || ':' || r.user_id::text);
  END LOOP;
  RETURN _id;
END; $function$;

CREATE OR REPLACE FUNCTION public.project_owner_change_decide(_request uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); rq record; _pname text; _clean text := NULLIF(btrim(COALESCE(_note,'')),'');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập'; END IF;
  IF NOT (public.has_role(_uid,'cmo') OR public.has_role(_uid,'admin')) THEN
    RAISE EXCEPTION 'Chỉ CMO hoặc Admin được duyệt đổi Chủ dự án';
  END IF;
  SELECT * INTO rq FROM public.project_owner_change_requests WHERE id = _request;
  IF rq.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu'; END IF;
  IF rq.status <> 'pending' THEN RAISE EXCEPTION 'Yêu cầu đã được xử lý'; END IF;
  IF NOT _approve AND _clean IS NULL THEN RAISE EXCEPTION 'Cần nhập lý do từ chối'; END IF;

  SELECT name INTO _pname FROM public.projects WHERE id = rq.project_id;

  UPDATE public.project_owner_change_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         decided_by = _uid, decided_at = now(), decision_note = _clean
   WHERE id = _request;

  IF _approve THEN
    UPDATE public.projects SET owner_id = rq.proposed_owner_id, updated_at = now()
     WHERE id = rq.project_id;
  END IF;

  PERFORM public.write_audit(
    CASE WHEN _approve THEN 'project.owner_change_approved' ELSE 'project.owner_change_rejected' END,
    'project', rq.project_id, NULL,
    jsonb_build_object('request_id',_request,'proposed_owner_id',rq.proposed_owner_id,'note',_clean), '{}'::jsonb);

  PERFORM public.notify_user(rq.requested_by, 'project.owner_change_decided',
    CASE WHEN _approve THEN 'Yêu cầu đổi Chủ dự án đã được duyệt' ELSE 'Yêu cầu đổi Chủ dự án bị từ chối' END,
    COALESCE(_pname,'Dự án') || COALESCE(E'\nGhi chú: ' || _clean, ''),
    'project', rq.project_id, '/projects/' || rq.project_id::text,
    'project.owner_change_decided:' || _request::text || ':' || rq.requested_by::text);

  IF _approve THEN
    PERFORM public.notify_user(rq.proposed_owner_id, 'project.owner_change_decided',
      'Bạn là Chủ dự án mới', COALESCE(_pname,'Dự án'),
      'project', rq.project_id, '/projects/' || rq.project_id::text,
      'project.owner_change_new:' || _request::text);
  END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.project_owner_change_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_owner_change_decide(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_owner_change_request(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_owner_change_decide(uuid, boolean, text) TO authenticated;