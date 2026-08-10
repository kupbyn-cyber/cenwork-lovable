-- ============ 1. Archive / soft delete columns ============
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS restore_reason text,
  ADD COLUMN IF NOT EXISTS status_before_delete public.report_doc_status;

CREATE INDEX IF NOT EXISTS reports_archived_idx ON public.reports (archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS reports_deleted_idx ON public.reports (deleted_at) WHERE deleted_at IS NOT NULL;

-- ============ 2. Visibility / editability ============
CREATE OR REPLACE FUNCTION public.report_doc_visible(_report uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (
    select 1 from public.reports r
    where r.id = _report
      and (r.deleted_at is null or public.report_config_manager())
      and (
        r.author_id = auth.uid()
        or r.reviewer_id = auth.uid()
        or public.report_config_manager()
        or exists (
          select 1 from public.report_sections s
          where s.report_id = r.id and s.team_id is not null and public.report_team_leader(s.team_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.report_doc_editable(_report uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (
    select 1 from public.reports r
    where r.id = _report and r.author_id = auth.uid()
      and r.archived_at is null and r.deleted_at is null
      and r.status in ('draft','submitted','pending_review','revision_required','reopened')
  );
$$;

DROP POLICY IF EXISTS reports_update ON public.reports;
CREATE POLICY reports_update ON public.reports FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND archived_at IS NULL AND deleted_at IS NULL
         AND status = ANY (ARRAY['draft'::report_doc_status,'revision_required'::report_doc_status,'reopened'::report_doc_status]))
  WITH CHECK (author_id = auth.uid());

-- can a user archive this report (leader of one of its teams, or CMO)
CREATE OR REPLACE FUNCTION public.report_can_archive(_report uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select public.report_config_manager()
      or exists (
        select 1 from public.reports r
        left join public.report_sections s on s.report_id = r.id
        where r.id = _report
          and ((r.team_id is not null and public.report_team_leader(r.team_id))
               or (s.team_id is not null and public.report_team_leader(s.team_id)))
      );
$$;

-- ============ 3. Report-scoped notification helper (telegram optional) ============
CREATE OR REPLACE FUNCTION public.report_notify(
  _recipient uuid, _event text, _title text, _body text,
  _entity_type text, _entity_id uuid, _link text, _event_key text,
  _telegram boolean DEFAULT false, _skip_actor boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
        _title
        || CASE WHEN COALESCE(_body,'') = '' THEN '' ELSE E'\n' || _body END
        || CASE WHEN COALESCE(_link,'') = '' THEN '' ELSE E'\n' || _link END,
        _event_key);
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.write_audit('report.telegram_enqueue_failed','notification', _id, NULL,
        jsonb_build_object('recipient_id', _recipient, 'event', _event, 'error', SQLERRM), '{}'::jsonb);
    END;
  END IF;
END; $$;

-- ============ 4. Reminder / overdue job (Asia/Bangkok, idempotent) ============
CREATE OR REPLACE FUNCTION public.report_run_reminders()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _now timestamptz := now();
  _r record;
  _label text; _due_local text; _link text;
  _open int := 0; _soon int := 0; _over int := 0; _final int := 0;
BEGIN
  FOR _r IN
    SELECT o.id, o.user_id, o.report_type, o.period_key, o.due_at, p.opens_at
    FROM public.report_obligations o
    JOIN public.report_periods p ON p.id = o.period_id
    LEFT JOIN public.reports r ON r.id = o.report_id
    WHERE o.is_exempt = false
      AND o.first_submitted_at IS NULL
      AND p.opens_at <= _now
      AND p.status <> 'closed'
      AND o.due_at >= _now - interval '7 days'
      AND (r.id IS NULL OR (r.deleted_at IS NULL AND r.status IN ('draft','revision_required','reopened')))
  LOOP
    _label := CASE _r.report_type WHEN 'daily' THEN 'ngày' WHEN 'weekly' THEN 'tuần' ELSE 'dự án' END;
    _due_local := to_char(_r.due_at AT TIME ZONE 'Asia/Bangkok', 'HH24:MI DD/MM');
    _link := '/reports';

    PERFORM public.report_notify(_r.user_id, 'report.period_open',
      'Kỳ báo cáo ' || _label || ' đã mở',
      'Kỳ ' || _r.period_key || ' – hạn ' || _due_local,
      'report_obligation', _r.id, _link, 'report_open:' || _r.id::text, false, false);
    _open := _open + 1;

    IF _now >= _r.due_at - interval '4 hours' AND _now < _r.due_at THEN
      PERFORM public.report_notify(_r.user_id, 'report.due_soon',
        'Sắp đến hạn báo cáo ' || _label,
        'Kỳ ' || _r.period_key || ' – hạn ' || _due_local || '. Bạn chưa gửi báo cáo.',
        'report_obligation', _r.id, _link, 'report_due_soon:' || _r.id::text, true, false);
      _soon := _soon + 1;
    END IF;

    IF _now >= _r.due_at THEN
      PERFORM public.report_notify(_r.user_id, 'report.overdue',
        'Quá hạn báo cáo ' || _label,
        'Kỳ ' || _r.period_key || ' đã quá hạn ' || _due_local || '. Vẫn có thể gửi, sẽ tính là gửi muộn.',
        'report_obligation', _r.id, _link, 'report_overdue:' || _r.id::text, true, false);
      _over := _over + 1;
    END IF;

    IF _now >= _r.due_at + interval '8 hours' THEN
      PERFORM public.report_notify(_r.user_id, 'report.overdue_final',
        'Nhắc lần cuối: báo cáo ' || _label,
        'Kỳ ' || _r.period_key || ' vẫn chưa được gửi.',
        'report_obligation', _r.id, _link, 'report_final:' || _r.id::text, true, false);
      _final := _final + 1;
    END IF;
  END LOOP;

  PERFORM public.write_audit('report.reminder_job', 'report_job', NULL, NULL,
    jsonb_build_object('ran_at', _now, 'candidates', _open, 'due_soon', _soon, 'overdue', _over, 'final', _final),
    '{}'::jsonb);

  RETURN jsonb_build_object('ran_at', _now, 'candidates', _open, 'due_soon', _soon, 'overdue', _over, 'final', _final);
END; $$;

-- ============ 5. Workflow notification triggers ============
CREATE OR REPLACE FUNCTION public.notify_report_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _link text := '/reports/doc/' || NEW.id::text;
  _label text := CASE NEW.report_type WHEN 'daily' THEN 'ngày' WHEN 'weekly' THEN 'tuần' ELSE 'dự án' END;
  _reviewer uuid := COALESCE(NEW.reviewer_id, public.report_current_reviewer(NEW.id));
  _author_name text;
BEGIN
  SELECT COALESCE(full_name, email) INTO _author_name FROM public.profiles WHERE id = NEW.author_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.report_type = 'project' THEN
      PERFORM public.report_notify(NEW.author_id, 'report.project_created',
        'Cần làm báo cáo kết thúc dự án',
        'Báo cáo kỳ ' || NEW.period_key || ' đã được tạo.',
        'report', NEW.id, _link, 'report_project_created:' || NEW.id::text, true, false);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('submitted','pending_review') AND OLD.status NOT IN ('submitted','pending_review') THEN
      PERFORM public.report_notify(_reviewer, 'report.submitted',
        'Báo cáo ' || _label || ' cần kiểm tra',
        COALESCE(_author_name,'Thành viên') || ' đã gửi báo cáo kỳ ' || NEW.period_key || '.',
        'report', NEW.id, _link,
        'report_submitted:' || NEW.id::text || ':' || COALESCE(NEW.current_version,0)::text, false);
    ELSIF NEW.status = 'revision_required' THEN
      PERFORM public.report_notify(NEW.author_id, 'report.revision_required',
        'Báo cáo cần bổ sung',
        'Báo cáo ' || _label || ' kỳ ' || NEW.period_key || ' cần được bổ sung.',
        'report', NEW.id, _link,
        'report_revision:' || NEW.id::text || ':' || NEW.revision_round::text, true);
    ELSIF NEW.status = 'confirmed' THEN
      PERFORM public.report_notify(NEW.author_id, 'report.confirmed',
        'Báo cáo đã được xác nhận',
        'Báo cáo ' || _label || ' kỳ ' || NEW.period_key || ' đã được xác nhận.',
        'report', NEW.id, _link,
        'report_confirmed:' || NEW.id::text || ':' || COALESCE(NEW.current_version,0)::text, true);
    ELSIF NEW.status = 'reopened' THEN
      PERFORM public.report_notify(NEW.author_id, 'report.reopened',
        'Báo cáo đã được mở lại',
        'Báo cáo ' || _label || ' kỳ ' || NEW.period_key || ' đã được mở lại để chỉnh sửa.',
        'report', NEW.id, _link,
        'report_reopened:' || NEW.id::text || ':' || COALESCE(NEW.current_version,0)::text, true);
    END IF;
  ELSIF NEW.status IN ('submitted','pending_review')
        AND NEW.current_version IS DISTINCT FROM OLD.current_version THEN
    PERFORM public.report_notify(_reviewer, 'report.edited_pending',
      'Báo cáo được chỉnh sửa khi đang chờ duyệt',
      COALESCE(_author_name,'Thành viên') || ' vừa cập nhật báo cáo kỳ ' || NEW.period_key || '.',
      'report', NEW.id, _link,
      'report_edited:' || NEW.id::text || ':' || COALESCE(NEW.current_version,0)::text, false);
  END IF;

  IF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id AND NEW.reviewer_id IS NOT NULL THEN
    PERFORM public.report_notify(NEW.reviewer_id, 'report.reviewer_assigned',
      'Bạn được giao kiểm tra báo cáo',
      'Báo cáo ' || _label || ' kỳ ' || NEW.period_key || '.',
      'report', NEW.id, _link,
      'report_reviewer:' || NEW.id::text || ':' || NEW.reviewer_id::text, true);
  END IF;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    PERFORM public.report_notify(NEW.author_id, 'report.transferred',
      'Bạn được chuyển phụ trách báo cáo',
      'Báo cáo ' || _label || ' kỳ ' || NEW.period_key || '.',
      'report', NEW.id, _link,
      'report_transfer:' || NEW.id::text || ':' || NEW.author_id::text, true);
  END IF;

  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at AND NEW.archived_at IS NOT NULL THEN
    PERFORM public.report_notify(NEW.author_id, 'report.archived',
      'Báo cáo đã được lưu trữ',
      'Báo cáo ' || _label || ' kỳ ' || NEW.period_key || ' đã chuyển sang lưu trữ.',
      'report', NEW.id, _link, 'report_archived:' || NEW.id::text || ':' || NEW.archived_at::text, false);
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NEW.deleted_at IS NOT NULL THEN
    PERFORM public.report_notify(NEW.author_id, 'report.deleted',
      'Báo cáo đã bị xóa mềm',
      'Lý do: ' || COALESCE(NEW.delete_reason,''),
      'report', NEW.id, '/reports', 'report_deleted:' || NEW.id::text || ':' || NEW.deleted_at::text, false);
  END IF;

  IF NEW.restored_at IS DISTINCT FROM OLD.restored_at AND NEW.restored_at IS NOT NULL THEN
    PERFORM public.report_notify(NEW.author_id, 'report.restored',
      'Báo cáo đã được phục hồi',
      'Lý do: ' || COALESCE(NEW.restore_reason,''),
      'report', NEW.id, _link, 'report_restored:' || NEW.id::text || ':' || NEW.restored_at::text, false);
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_report_events ON public.reports;
CREATE TRIGGER trg_notify_report_events
AFTER INSERT OR UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.notify_report_events();

CREATE OR REPLACE FUNCTION public.notify_report_reopen_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _link text := '/reports/doc/' || NEW.report_id::text; _target uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(r.reviewer_id, public.report_cmo_id()) INTO _target FROM public.reports r WHERE r.id = NEW.report_id;
    PERFORM public.report_notify(_target, 'report.reopen_requested',
      'Yêu cầu mở lại báo cáo', NEW.reason,
      'report', NEW.report_id, _link, 'report_reopen_req:' || NEW.id::text, false);
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
    PERFORM public.report_notify(NEW.requested_by,
      CASE WHEN NEW.status = 'approved' THEN 'report.reopen_approved' ELSE 'report.reopen_rejected' END,
      CASE WHEN NEW.status = 'approved' THEN 'Yêu cầu mở lại được duyệt' ELSE 'Yêu cầu mở lại bị từ chối' END,
      COALESCE(NEW.decision_note, ''),
      'report', NEW.report_id, _link, 'report_reopen_decision:' || NEW.id::text || ':' || NEW.status::text, true);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_report_reopen ON public.report_reopen_requests;
CREATE TRIGGER trg_notify_report_reopen
AFTER INSERT OR UPDATE ON public.report_reopen_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_report_reopen_events();

CREATE OR REPLACE FUNCTION public.notify_report_obligation_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_exempt IS DISTINCT FROM OLD.is_exempt THEN
    PERFORM public.report_notify(NEW.user_id,
      CASE WHEN NEW.is_exempt THEN 'report.obligation_exempt' ELSE 'report.obligation_restored' END,
      CASE WHEN NEW.is_exempt THEN 'Bạn được miễn nghĩa vụ báo cáo' ELSE 'Nghĩa vụ báo cáo được khôi phục' END,
      'Kỳ ' || NEW.period_key || COALESCE(' – ' || NEW.exempt_reason, ''),
      'report_obligation', NEW.id, '/reports',
      'report_exempt:' || NEW.id::text || ':' || NEW.is_exempt::text, false);
  END IF;
  IF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id AND NEW.reviewer_id IS NOT NULL THEN
    PERFORM public.report_notify(NEW.reviewer_id, 'report.obligation_reviewer',
      'Bạn được giao kiểm tra nghĩa vụ báo cáo', 'Kỳ ' || NEW.period_key,
      'report_obligation', NEW.id, '/reports',
      'report_obl_reviewer:' || NEW.id::text || ':' || NEW.reviewer_id::text, true);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_report_obligation ON public.report_obligations;
CREATE TRIGGER trg_notify_report_obligation
AFTER UPDATE ON public.report_obligations
FOR EACH ROW EXECUTE FUNCTION public.notify_report_obligation_events();

CREATE OR REPLACE FUNCTION public.notify_team_summary_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _link text := '/reports'; _team text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT name INTO _team FROM public.teams WHERE id = NEW.team_id;
    IF NEW.status IN ('submitted','pending_review','published') THEN
      PERFORM public.report_notify(public.report_cmo_id(), 'report.team_summary_published',
        'Tổng hợp Team đã gửi', COALESCE(_team,'Team') || ' – tuần ' || NEW.week_start::text,
        'team_summary', NEW.id, _link,
        'team_summary_sent:' || NEW.id::text || ':' || NEW.status::text, false);
    ELSIF NEW.status = 'revision_required' THEN
      PERFORM public.report_notify(NEW.leader_id, 'report.team_summary_revision',
        'Tổng hợp Team cần bổ sung', COALESCE(_team,'Team') || ' – tuần ' || NEW.week_start::text,
        'team_summary', NEW.id, _link,
        'team_summary_revision:' || NEW.id::text || ':' || NEW.current_version::text, true);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_team_summary ON public.team_weekly_summaries;
CREATE TRIGGER trg_notify_team_summary
AFTER UPDATE ON public.team_weekly_summaries
FOR EACH ROW EXECUTE FUNCTION public.notify_team_summary_events();

-- ============ 6. Archive / soft delete / restore actions ============
CREATE OR REPLACE FUNCTION public.report_set_archived(_report uuid, _archived boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.reports;
BEGIN
  SELECT * INTO _r FROM public.reports WHERE id = _report;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy báo cáo'; END IF;
  IF _r.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Báo cáo đã bị xóa mềm'; END IF;
  IF NOT public.report_can_archive(_report) THEN
    RAISE EXCEPTION 'Bạn không có quyền lưu trữ báo cáo này';
  END IF;

  UPDATE public.reports
     SET archived_at = CASE WHEN _archived THEN now() ELSE NULL END,
         archived_by = CASE WHEN _archived THEN auth.uid() ELSE NULL END,
         archive_reason = CASE WHEN _archived THEN NULLIF(btrim(COALESCE(_reason,'')),'') ELSE NULL END
   WHERE id = _report;

  PERFORM public.write_audit(
    CASE WHEN _archived THEN 'report.archived' ELSE 'report.unarchived' END,
    'report', _report,
    jsonb_build_object('archived_at', _r.archived_at),
    jsonb_build_object('archived_at', CASE WHEN _archived THEN now() ELSE NULL END),
    jsonb_build_object('reason', _reason));
END; $$;

CREATE OR REPLACE FUNCTION public.report_soft_delete(_report uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.reports;
BEGIN
  IF NOT public.report_config_manager() THEN
    RAISE EXCEPTION 'Chỉ CMO được xóa mềm báo cáo';
  END IF;
  IF COALESCE(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'Bắt buộc nhập lý do xóa mềm';
  END IF;
  SELECT * INTO _r FROM public.reports WHERE id = _report;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy báo cáo'; END IF;
  IF _r.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Báo cáo đã bị xóa mềm'; END IF;

  UPDATE public.reports
     SET deleted_at = now(), deleted_by = auth.uid(), delete_reason = btrim(_reason),
         status_before_delete = _r.status
   WHERE id = _report;

  PERFORM public.write_audit('report.soft_deleted', 'report', _report,
    to_jsonb(_r) - 'id', jsonb_build_object('deleted_at', now(), 'deleted_by', auth.uid()),
    jsonb_build_object('reason', btrim(_reason)));
END; $$;

CREATE OR REPLACE FUNCTION public.report_restore(_report uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.reports;
BEGIN
  IF NOT public.report_config_manager() THEN
    RAISE EXCEPTION 'Chỉ CMO được phục hồi báo cáo';
  END IF;
  IF COALESCE(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'Bắt buộc nhập lý do phục hồi';
  END IF;
  SELECT * INTO _r FROM public.reports WHERE id = _report;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy báo cáo'; END IF;
  IF _r.deleted_at IS NULL THEN RAISE EXCEPTION 'Báo cáo không ở trạng thái đã xóa'; END IF;

  UPDATE public.reports
     SET deleted_at = NULL, deleted_by = NULL,
         status = COALESCE(_r.status_before_delete, _r.status),
         status_before_delete = NULL,
         restored_at = now(), restored_by = auth.uid(), restore_reason = btrim(_reason)
   WHERE id = _report;

  PERFORM public.write_audit('report.restored', 'report', _report,
    jsonb_build_object('deleted_at', _r.deleted_at, 'delete_reason', _r.delete_reason, 'status', _r.status),
    jsonb_build_object('restored_at', now(), 'status', COALESCE(_r.status_before_delete, _r.status)),
    jsonb_build_object('reason', btrim(_reason)));
END; $$;

-- ============ 7. Execute privileges ============
REVOKE EXECUTE ON FUNCTION public.report_notify(uuid,text,text,text,text,uuid,text,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_run_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_report_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_report_reopen_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_report_obligation_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_team_summary_events() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.report_set_archived(uuid,boolean,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_soft_delete(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_restore(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_can_archive(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.report_set_archived(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_soft_delete(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_restore(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_can_archive(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_run_reminders() TO service_role;