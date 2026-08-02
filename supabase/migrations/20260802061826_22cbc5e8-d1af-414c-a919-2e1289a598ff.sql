ALTER TABLE public.announcement_reminders DROP CONSTRAINT IF EXISTS announcement_reminders_kind_check;

CREATE TABLE IF NOT EXISTS public.approval_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_request_id, version_no, user_id, kind)
);

GRANT SELECT ON public.approval_reminders TO authenticated;
GRANT ALL ON public.approval_reminders TO service_role;
ALTER TABLE public.approval_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_reminders_select_involved" ON public.approval_reminders;
CREATE POLICY "approval_reminders_select_involved" ON public.approval_reminders
  FOR SELECT TO authenticated
  USING (public.approval_can_view(approval_request_id));

CREATE INDEX IF NOT EXISTS idx_ann_recipients_due_status
  ON public.announcement_recipients (status, due_at);
CREATE INDEX IF NOT EXISTS idx_ann_recipients_user_status
  ON public.announcement_recipients (user_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status_due
  ON public.approval_requests (status, due_at);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_approver_status
  ON public.approval_decisions (approver_id, decision_status, version_no);
CREATE INDEX IF NOT EXISTS idx_approval_reminders_lookup
  ON public.approval_reminders (approval_request_id, version_no, user_id);

CREATE OR REPLACE FUNCTION public.nap_run_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _local        timestamp := (now() AT TIME ZONE 'Asia/Bangkok');
  _hour         integer;
  _in_window    boolean;
  _slot_ok      boolean;
  _slot_kind    text;
  _r            record;
  _ann_pre      integer := 0;
  _ann_over     integer := 0;
  _appr_pre     integer := 0;
  _appr_over    integer := 0;
  _sender       integer := 0;
  _overdue_marked integer := 0;
  _kind         text;
  _link         text;
  _due_txt      text;
BEGIN
  _hour := extract(hour FROM _local)::int;
  _in_window := _hour >= 8 AND _hour < 22;
  _slot_ok := _in_window AND (_hour % 2 = 0);
  _slot_kind := 'overdue_slot:' || to_char(date_trunc('hour', _local), 'YYYY-MM-DD HH24');

  _ann_pre := public.announcement_enqueue_reminders();

  IF _in_window THEN
    FOR _r IN
      SELECT rc.announcement_id, rc.user_id, rc.version, rc.due_at, a.title, a.created_by
        FROM public.announcement_recipients rc
        JOIN public.announcements a ON a.id = rc.announcement_id
        JOIN public.profiles p ON p.id = rc.user_id AND p.status = 'active'
       WHERE rc.status IN ('unread', 'reading')
         AND a.status = 'published'
         AND a.deleted_at IS NULL
         AND a.revoked_at IS NULL
         AND a.archived_at IS NULL
         AND rc.due_at <= now()
       LIMIT 500
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.announcement_reminders
         WHERE announcement_id = _r.announcement_id AND user_id = _r.user_id
           AND version = _r.version AND kind = 'overdue_start'
      ) THEN
        _kind := 'overdue_start';
      ELSIF _slot_ok THEN
        _kind := _slot_kind;
      ELSE
        CONTINUE;
      END IF;

      BEGIN
        INSERT INTO public.announcement_reminders (announcement_id, user_id, version, kind)
        VALUES (_r.announcement_id, _r.user_id, _r.version, _kind);
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;

      _due_txt := to_char(_r.due_at AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI');
      PERFORM public.notify_user(
        _r.user_id,
        'announcement.overdue_reminder',
        'Thông báo đã quá hạn xác nhận',
        _r.title || ' — hạn ' || _due_txt || '. Vui lòng mở và bấm Xác nhận đã đọc.',
        'announcement', _r.announcement_id,
        '/announcements/' || _r.announcement_id::text,
        'announcement.overdue:' || _r.announcement_id::text || ':v' || _r.version::text
          || ':' || _r.user_id::text || ':' || _kind
      );
      _ann_over := _ann_over + 1;

      IF _r.created_by IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.announcement_reminders
         WHERE announcement_id = _r.announcement_id AND user_id = _r.created_by
           AND version = _r.version AND kind = 'sender_overdue'
      ) THEN
        BEGIN
          INSERT INTO public.announcement_reminders (announcement_id, user_id, version, kind)
          VALUES (_r.announcement_id, _r.created_by, _r.version, 'sender_overdue');
          PERFORM public.notify_user(
            _r.created_by, 'announcement.sender_overdue',
            'Thông báo của bạn đã quá hạn xác nhận',
            _r.title || ' — còn người nhận chưa xác nhận sau hạn ' || _due_txt || '.',
            'announcement', _r.announcement_id,
            '/announcements/' || _r.announcement_id::text,
            'announcement.sender_overdue:' || _r.announcement_id::text || ':v' || _r.version::text
          );
          _sender := _sender + 1;
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END IF;
    END LOOP;
  END IF;

  _overdue_marked := public.approval_mark_overdue();

  FOR _r IN
    SELECT d.approval_request_id, d.version_no, d.approver_id,
           r.title, r.due_at, r.sender_id, r.status
      FROM public.approval_decisions d
      JOIN public.approval_requests r
        ON r.id = d.approval_request_id AND r.current_version = d.version_no
      JOIN public.profiles p ON p.id = d.approver_id AND p.status = 'active'
     WHERE d.decision_status = 'pending'
       AND r.status IN ('pending', 'overdue')
       AND r.withdrawn_at IS NULL
     LIMIT 500
  LOOP
    _link := '/approvals/' || _r.approval_request_id::text;
    _due_txt := to_char(_r.due_at AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI');

    IF _r.due_at > now() THEN
      IF _r.due_at <= now() + interval '24 hours' THEN
        _kind := 'due_24h';
      ELSE
        CONTINUE;
      END IF;
    ELSIF _in_window THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.approval_reminders
         WHERE approval_request_id = _r.approval_request_id AND version_no = _r.version_no
           AND user_id = _r.approver_id AND kind = 'overdue_start'
      ) THEN
        _kind := 'overdue_start';
      ELSIF _slot_ok THEN
        _kind := _slot_kind;
      ELSE
        CONTINUE;
      END IF;
    ELSE
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.approval_reminders (approval_request_id, version_no, user_id, kind)
      VALUES (_r.approval_request_id, _r.version_no, _r.approver_id, _kind);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;

    PERFORM public.notify_user(
      _r.approver_id,
      CASE WHEN _kind = 'due_24h' THEN 'approval.due_24h' ELSE 'approval.overdue_reminder' END,
      CASE WHEN _kind = 'due_24h'
           THEN 'Còn 24 giờ đến hạn xử lý yêu cầu phê duyệt'
           ELSE 'Yêu cầu phê duyệt đã quá hạn xử lý' END,
      _r.title || ' — hạn ' || _due_txt || '. Vui lòng phê duyệt hoặc từ chối.',
      'approval_request', _r.approval_request_id, _link,
      'approval.' || _kind || ':' || _r.approval_request_id::text
        || ':v' || _r.version_no::text || ':' || _r.approver_id::text
    );

    IF _kind = 'due_24h' THEN
      _appr_pre := _appr_pre + 1;
    ELSE
      _appr_over := _appr_over + 1;
      IF NOT EXISTS (
        SELECT 1 FROM public.approval_reminders
         WHERE approval_request_id = _r.approval_request_id AND version_no = _r.version_no
           AND user_id = _r.sender_id AND kind = 'sender_overdue'
      ) THEN
        BEGIN
          INSERT INTO public.approval_reminders (approval_request_id, version_no, user_id, kind)
          VALUES (_r.approval_request_id, _r.version_no, _r.sender_id, 'sender_overdue');
          PERFORM public.notify_user(
            _r.sender_id, 'approval.sender_overdue',
            'Yêu cầu phê duyệt của bạn đã quá hạn',
            _r.title || ' — còn người phê duyệt chưa xử lý sau hạn ' || _due_txt || '.',
            'approval_request', _r.approval_request_id, _link,
            'approval.sender_overdue:' || _r.approval_request_id::text
              || ':v' || _r.version_no::text
          );
          _sender := _sender + 1;
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'local_time', to_char(_local, 'YYYY-MM-DD HH24:MI'),
    'in_window', _in_window,
    'slot_reminder', _slot_ok,
    'announcement_pre', _ann_pre,
    'announcement_overdue', _ann_over,
    'approval_pre', _appr_pre,
    'approval_overdue', _appr_over,
    'sender_notices', _sender,
    'approval_marked_overdue', _overdue_marked
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.nap_run_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nap_run_reminders() FROM anon;
REVOKE ALL ON FUNCTION public.nap_run_reminders() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.nap_run_reminders() TO service_role;

CREATE OR REPLACE FUNCTION public.nap_operation_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
  _admin boolean;
  _out jsonb;
BEGIN
  IF _me IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  _admin := public.has_role(_me, 'admin') OR public.has_role(_me, 'cmo');

  SELECT jsonb_build_object(
    'is_admin', _admin,
    'announcement_unconfirmed', (
      SELECT count(DISTINCT rc.announcement_id) FROM public.announcement_recipients rc
        JOIN public.announcements a ON a.id = rc.announcement_id
       WHERE rc.user_id = _me AND rc.status IN ('unread','reading')
         AND a.status = 'published' AND a.deleted_at IS NULL
         AND a.revoked_at IS NULL AND a.archived_at IS NULL
    ),
    'announcement_overdue', (
      SELECT count(DISTINCT rc.announcement_id) FROM public.announcement_recipients rc
        JOIN public.announcements a ON a.id = rc.announcement_id
       WHERE rc.user_id = _me AND rc.status IN ('unread','reading') AND rc.due_at <= now()
         AND a.status = 'published' AND a.deleted_at IS NULL
         AND a.revoked_at IS NULL AND a.archived_at IS NULL
    ),
    'approval_pending_me', (
      SELECT count(*) FROM public.approval_decisions d
        JOIN public.approval_requests r ON r.id = d.approval_request_id
         AND r.current_version = d.version_no
       WHERE d.approver_id = _me AND d.decision_status = 'pending'
         AND r.status IN ('pending','overdue')
    ),
    'approval_overdue_me', (
      SELECT count(*) FROM public.approval_decisions d
        JOIN public.approval_requests r ON r.id = d.approval_request_id
         AND r.current_version = d.version_no
       WHERE d.approver_id = _me AND d.decision_status = 'pending'
         AND r.status = 'overdue'
    ),
    'approval_sent_pending', (
      SELECT count(*) FROM public.approval_requests
       WHERE sender_id = _me AND status IN ('pending','overdue')
    ),
    'approval_sent_approved', (
      SELECT count(*) FROM public.approval_requests
       WHERE sender_id = _me AND status = 'approved'
    ),
    'approval_sent_rejected', (
      SELECT count(*) FROM public.approval_requests
       WHERE sender_id = _me AND status = 'rejected'
    )
  ) INTO _out;

  IF _admin THEN
    _out := _out || jsonb_build_object(
      'org_announcement_overdue', (
        SELECT count(DISTINCT rc.announcement_id) FROM public.announcement_recipients rc
          JOIN public.announcements a ON a.id = rc.announcement_id
         WHERE rc.status IN ('unread','reading') AND rc.due_at <= now()
           AND a.status = 'published' AND a.deleted_at IS NULL
           AND a.revoked_at IS NULL AND a.archived_at IS NULL
      ),
      'org_approval_pending', (
        SELECT count(*) FROM public.approval_requests WHERE status = 'pending'
      ),
      'org_approval_overdue', (
        SELECT count(*) FROM public.approval_requests WHERE status = 'overdue'
      ),
      'org_approval_approved', (
        SELECT count(*) FROM public.approval_requests WHERE status = 'approved'
      ),
      'org_approval_rejected', (
        SELECT count(*) FROM public.approval_requests WHERE status = 'rejected'
      )
    );
  END IF;

  RETURN _out;
END;
$function$;

REVOKE ALL ON FUNCTION public.nap_operation_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nap_operation_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.nap_operation_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nap_operation_stats() TO service_role;