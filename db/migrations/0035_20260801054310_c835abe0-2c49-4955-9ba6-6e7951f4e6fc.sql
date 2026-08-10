-- ============ SIẾT QUYỀN GỌI HÀM MỚI ============
REVOKE EXECUTE ON FUNCTION public.announcement_is_active(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_announcement(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_announcement(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_moderate_announcement() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.announcement_comments_open(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.announcement_current_version(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.announcement_is_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_announcement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_announcement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_moderate_announcement() TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_comments_open(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_current_version(uuid) TO authenticated;

-- ============ CHỈNH SỬA NHỎ ============
CREATE OR REPLACE FUNCTION public.announcement_minor_revision(
  _a uuid, _title text, _body text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old public.announcements;
BEGIN
  IF NOT public.can_edit_announcement(_a) THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa thông báo này';
  END IF;
  IF COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Phải nhập lý do chỉnh sửa'; END IF;
  SELECT * INTO _old FROM public.announcements WHERE id = _a;
  IF _old.id IS NULL OR _old.status <> 'published' THEN
    RAISE EXCEPTION 'Chỉ áp dụng cho thông báo đã phát hành';
  END IF;

  INSERT INTO public.announcement_revisions (announcement_id, version, before_data, after_data, reason, created_by)
  VALUES (_a, _old.current_version,
    jsonb_build_object('title',_old.title,'body',_old.body),
    jsonb_build_object('title',_title,'body',_body), _reason, auth.uid());

  UPDATE public.announcements
     SET title = _title, body = _body, last_minor_edit_at = now()
   WHERE id = _a;

  PERFORM public.write_audit('announcement.minor_edited','announcement',_a,
    jsonb_build_object('title',_old.title), jsonb_build_object('title',_title,'reason',_reason), '{}'::jsonb);
END; $$;
REVOKE EXECUTE ON FUNCTION public.announcement_minor_revision(uuid,text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.announcement_minor_revision(uuid,text,text,text) TO authenticated;

-- ============ TẠO PHIÊN BẢN MỚI ============
CREATE OR REPLACE FUNCTION public.announcement_new_version(
  _a uuid, _title text, _body text, _due_at timestamptz,
  _comments_enabled boolean, _result_visibility text,
  _reason text, _change_summary text, _questions jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old public.announcements; _new_version integer; _q jsonb; _qid uuid; _pos integer := 0;
        _opt jsonb; _opos integer; _r record;
BEGIN
  IF NOT public.can_edit_announcement(_a) THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh sửa thông báo này';
  END IF;
  IF COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Phải nhập lý do thay đổi'; END IF;
  SELECT * INTO _old FROM public.announcements WHERE id = _a;
  IF _old.id IS NULL OR _old.status <> 'published' THEN
    RAISE EXCEPTION 'Chỉ áp dụng cho thông báo đã phát hành';
  END IF;
  IF _old.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Thông báo đã thu hồi'; END IF;
  IF _due_at IS NULL THEN RAISE EXCEPTION 'Phải có hạn xác nhận'; END IF;

  _new_version := _old.current_version + 1;

  -- lưu ảnh chụp phiên bản cũ (nếu chưa có) và phiên bản mới
  INSERT INTO public.announcement_versions
    (announcement_id, version, title, body, due_at, comments_enabled, result_visibility, reason, change_summary, created_by)
  VALUES (_a, _old.current_version, _old.title, _old.body, _old.due_at,
          _old.comments_enabled, _old.result_visibility, NULL, NULL, _old.created_by)
  ON CONFLICT (announcement_id, version) DO NOTHING;

  INSERT INTO public.announcement_versions
    (announcement_id, version, title, body, due_at, comments_enabled, result_visibility, reason, change_summary, created_by)
  VALUES (_a, _new_version, _title, _body, _due_at, _comments_enabled, _result_visibility,
          _reason, _change_summary, auth.uid());

  -- giữ nguyên lịch sử người nhận của phiên bản cũ
  INSERT INTO public.announcement_recipient_history
    (announcement_id, user_id, version, status, due_at, first_opened_at, read_completed_at,
     acknowledged_at, is_late, exempt_reason)
  SELECT r.announcement_id, r.user_id, r.version, r.status, r.due_at, r.first_opened_at,
         r.read_completed_at, r.acknowledged_at, r.is_late, r.exempt_reason
  FROM public.announcement_recipients r
  WHERE r.announcement_id = _a
  ON CONFLICT (announcement_id, user_id, version) DO NOTHING;

  -- yêu cầu xác nhận lại: không thêm/bớt người nhận, giữ nguyên miễn hoàn thành
  UPDATE public.announcement_recipients
     SET version = _new_version, status = 'unread', due_at = _due_at,
         first_opened_at = NULL, read_completed_at = NULL, acknowledged_at = NULL,
         is_late = false, updated_at = now()
   WHERE announcement_id = _a AND status <> 'exempt';

  UPDATE public.announcement_recipients
     SET version = _new_version, due_at = _due_at, updated_at = now()
   WHERE announcement_id = _a AND status = 'exempt';

  UPDATE public.announcements
     SET title = _title, body = _body, due_at = _due_at,
         comments_enabled = _comments_enabled, result_visibility = _result_visibility,
         current_version = _new_version, last_minor_edit_at = NULL
   WHERE id = _a;

  -- câu hỏi khảo sát của phiên bản mới
  IF _questions IS NOT NULL AND jsonb_typeof(_questions) = 'array' THEN
    FOR _q IN SELECT * FROM jsonb_array_elements(_questions) LOOP
      INSERT INTO public.announcement_questions
        (announcement_id, version, position, question_type, content, is_required, min_select, max_select)
      VALUES (_a, _new_version, _pos, _q->>'type', _q->>'content',
              COALESCE((_q->>'required')::boolean,false),
              NULLIF(_q->>'min','')::integer, NULLIF(_q->>'max','')::integer)
      RETURNING id INTO _qid;
      _pos := _pos + 1;
      _opos := 0;
      IF jsonb_typeof(_q->'options') = 'array' THEN
        FOR _opt IN SELECT * FROM jsonb_array_elements(_q->'options') LOOP
          INSERT INTO public.announcement_question_options (question_id, announcement_id, position, label)
          VALUES (_qid, _a, _opos, _opt#>>'{}');
          _opos := _opos + 1;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- thông báo và Telegram cho toàn bộ người nhận chưa miễn
  FOR _r IN SELECT user_id FROM public.announcement_recipients
             WHERE announcement_id = _a AND status <> 'exempt' LOOP
    PERFORM public.notify_user(_r.user_id,'announcement.new_version',
      'Thông báo nội bộ có phiên bản mới cần xác nhận lại', _title,
      'announcement', _a, '/announcements/' || _a::text,
      'announcement.version:' || _a::text || ':v' || _new_version::text);
  END LOOP;

  PERFORM public.write_audit('announcement.version_created','announcement',_a,
    jsonb_build_object('version',_old.current_version,'due_at',_old.due_at),
    jsonb_build_object('version',_new_version,'due_at',_due_at,'reason',_reason), '{}'::jsonb);

  RETURN _new_version;
END; $$;
REVOKE EXECUTE ON FUNCTION public.announcement_new_version(uuid,text,text,timestamptz,boolean,text,text,text,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.announcement_new_version(uuid,text,text,timestamptz,boolean,text,text,text,jsonb) TO authenticated;

-- ============ THU HỒI ============
CREATE OR REPLACE FUNCTION public.announcement_revoke(_a uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_edit_announcement(_a) THEN
    RAISE EXCEPTION 'Bạn không có quyền thu hồi thông báo này';
  END IF;
  IF COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Phải nhập lý do thu hồi'; END IF;
  UPDATE public.announcements
     SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = _reason
   WHERE id = _a AND status = 'published' AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thông báo không ở trạng thái có thể thu hồi'; END IF;
  PERFORM public.write_audit('announcement.revoked','announcement',_a, NULL,
    jsonb_build_object('reason',_reason), '{}'::jsonb);
END; $$;
REVOKE EXECUTE ON FUNCTION public.announcement_revoke(uuid,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.announcement_revoke(uuid,text) TO authenticated;

-- ============ LƯU TRỮ ============
CREATE OR REPLACE FUNCTION public.announcement_set_archived(_a uuid, _archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_edit_announcement(_a) THEN
    RAISE EXCEPTION 'Bạn không có quyền lưu trữ thông báo này';
  END IF;
  UPDATE public.announcements
     SET archived_at = CASE WHEN _archived THEN now() ELSE NULL END,
         archived_by = CASE WHEN _archived THEN auth.uid() ELSE NULL END
   WHERE id = _a;
  PERFORM public.write_audit(
    CASE WHEN _archived THEN 'announcement.archived' ELSE 'announcement.unarchived' END,
    'announcement', _a, NULL, '{}'::jsonb, '{}'::jsonb);
END; $$;
REVOKE EXECUTE ON FUNCTION public.announcement_set_archived(uuid,boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.announcement_set_archived(uuid,boolean) TO authenticated;

-- ============ NHÂN BẢN ============
CREATE OR REPLACE FUNCTION public.announcement_duplicate(_a uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _src public.announcements; _new uuid; _q record; _qid uuid;
BEGIN
  IF NOT public.can_view_announcement(_a) THEN
    RAISE EXCEPTION 'Bạn không có quyền xem thông báo này';
  END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cmo')
          OR public.announcement_author(_a) = auth.uid()) THEN
    RAISE EXCEPTION 'Bạn không có quyền nhân bản thông báo này';
  END IF;
  SELECT * INTO _src FROM public.announcements WHERE id = _a;

  INSERT INTO public.announcements (created_by, title, body, status, comments_enabled, result_visibility)
  VALUES (auth.uid(), _src.title, _src.body, 'draft', _src.comments_enabled, _src.result_visibility)
  RETURNING id INTO _new;

  FOR _q IN SELECT * FROM public.announcement_questions
             WHERE announcement_id = _a AND version = _src.current_version ORDER BY position LOOP
    INSERT INTO public.announcement_questions
      (announcement_id, version, position, question_type, content, is_required, min_select, max_select)
    VALUES (_new, 1, _q.position, _q.question_type, _q.content, _q.is_required, _q.min_select, _q.max_select)
    RETURNING id INTO _qid;
    INSERT INTO public.announcement_question_options (question_id, announcement_id, position, label)
    SELECT _qid, _new, o.position, o.label
      FROM public.announcement_question_options o WHERE o.question_id = _q.id ORDER BY o.position;
  END LOOP;

  PERFORM public.write_audit('announcement.duplicated','announcement',_new, NULL,
    jsonb_build_object('source_id',_a), '{}'::jsonb);
  RETURN _new;
END; $$;
REVOKE EXECUTE ON FUNCTION public.announcement_duplicate(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.announcement_duplicate(uuid) TO authenticated;

-- ============ XÁC NHẬN KÈM CÂU TRẢ LỜI ============
CREATE OR REPLACE FUNCTION public.announcement_acknowledge(_a uuid, _answers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
         updated_at = now()
   WHERE id = _rec.id AND status IN ('unread','reading');
END; $$;
REVOKE EXECUTE ON FUNCTION public.announcement_acknowledge(uuid,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.announcement_acknowledge(uuid,jsonb) TO authenticated;

-- ============ NHẮC HẠN 24 GIỜ VÀ 2 GIỜ ============
CREATE OR REPLACE FUNCTION public.announcement_enqueue_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _kind text; _sent integer := 0; _title text;
BEGIN
  FOR _r IN
    SELECT rc.announcement_id, rc.user_id, rc.version, rc.due_at, a.title
      FROM public.announcement_recipients rc
      JOIN public.announcements a ON a.id = rc.announcement_id
     WHERE rc.status IN ('unread','reading')
       AND a.status = 'published' AND a.deleted_at IS NULL AND a.revoked_at IS NULL
       AND rc.due_at > now() AND rc.due_at <= now() + interval '24 hours'
  LOOP
    _kind := CASE WHEN _r.due_at <= now() + interval '2 hours' THEN 'due_2h' ELSE 'due_24h' END;
    BEGIN
      INSERT INTO public.announcement_reminders (announcement_id, user_id, version, kind)
      VALUES (_r.announcement_id, _r.user_id, _r.version, _kind);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
    PERFORM public.notify_user(_r.user_id, 'announcement.' || _kind,
      CASE WHEN _kind = 'due_2h' THEN 'Còn 2 giờ đến hạn xác nhận thông báo'
           ELSE 'Còn 24 giờ đến hạn xác nhận thông báo' END,
      _r.title, 'announcement', _r.announcement_id,
      '/announcements/' || _r.announcement_id::text,
      'announcement.' || _kind || ':' || _r.announcement_id::text || ':v' || _r.version::text
        || ':' || _r.user_id::text);
    _sent := _sent + 1;
  END LOOP;
  RETURN _sent;
END; $$;
REVOKE EXECUTE ON FUNCTION public.announcement_enqueue_reminders() FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_enqueue_reminders() TO service_role;