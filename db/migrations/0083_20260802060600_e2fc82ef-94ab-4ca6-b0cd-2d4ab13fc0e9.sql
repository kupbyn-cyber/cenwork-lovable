-- ============ 1. BÌNH LUẬN PHÊ DUYỆT ============
CREATE TABLE public.approval_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  is_edited boolean NOT NULL DEFAULT false,
  hidden_at timestamptz,
  hidden_by uuid,
  hidden_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approval_comments_request_idx ON public.approval_comments(approval_request_id, created_at);

CREATE TABLE public.approval_comment_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.approval_comments(id) ON DELETE CASCADE,
  previous_body text NOT NULL,
  edited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approval_comment_edits_comment_idx ON public.approval_comment_edits(comment_id, created_at);

CREATE TABLE public.approval_comment_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.approval_comments(id) ON DELETE CASCADE,
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);
CREATE INDEX approval_comment_mentions_request_idx ON public.approval_comment_mentions(approval_request_id, user_id);

-- ============ 2. TỆP ĐÍNH KÈM ============
CREATE TABLE public.approval_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  uploaded_by uuid NOT NULL,
  removed_at timestamptz,
  removed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approval_attachments_request_idx ON public.approval_attachments(approval_request_id, version_no);

CREATE TABLE public.announcement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  uploaded_by uuid NOT NULL,
  removed_at timestamptz,
  removed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcement_attachments_announcement_idx ON public.announcement_attachments(announcement_id);

CREATE TRIGGER approval_comments_set_updated_at BEFORE UPDATE ON public.approval_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER approval_attachments_set_updated_at BEFORE UPDATE ON public.approval_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER announcement_attachments_set_updated_at BEFORE UPDATE ON public.announcement_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.approval_comments TO authenticated;
GRANT SELECT ON public.approval_comment_edits TO authenticated;
GRANT SELECT ON public.approval_comment_mentions TO authenticated;
GRANT SELECT ON public.approval_attachments TO authenticated;
GRANT SELECT ON public.announcement_attachments TO authenticated;
GRANT ALL ON public.approval_comments TO service_role;
GRANT ALL ON public.approval_comment_edits TO service_role;
GRANT ALL ON public.approval_comment_mentions TO service_role;
GRANT ALL ON public.approval_attachments TO service_role;
GRANT ALL ON public.announcement_attachments TO service_role;

ALTER TABLE public.approval_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_comment_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_comment_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_attachments ENABLE ROW LEVEL SECURITY;

-- ============ 3. QUYỀN XEM: bổ sung người được mention ============
CREATE OR REPLACE FUNCTION public.approval_can_view(_request uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_requests r
    WHERE r.id = _request
      AND (
        r.sender_id = auth.uid()
        OR public.current_app_role() IN ('admin', 'cmo')
        OR EXISTS (
          SELECT 1 FROM public.approval_decisions d
          WHERE d.approval_request_id = r.id AND d.approver_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.approval_comment_mentions m
          WHERE m.approval_request_id = r.id AND m.user_id = auth.uid()
        )
      )
  );
$$;

-- Người được mention CHỈ được xem và bình luận, không bao giờ là người phê duyệt.
CREATE OR REPLACE FUNCTION public.approval_can_comment(_request uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_active_account(auth.uid()) AND public.approval_can_view(_request);
$$;

-- Người có quyền mention: người gửi và người phê duyệt của bất kỳ phiên bản nào.
CREATE OR REPLACE FUNCTION public.approval_can_mention(_request uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_requests r
    WHERE r.id = _request
      AND (
        r.sender_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.approval_decisions d
                    WHERE d.approval_request_id = r.id AND d.approver_id = auth.uid())
      )
  );
$$;

CREATE POLICY "approval_comments_select" ON public.approval_comments
  FOR SELECT TO authenticated USING (public.approval_can_view(approval_request_id));
CREATE POLICY "approval_comment_edits_select" ON public.approval_comment_edits
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.approval_comments c
            WHERE c.id = comment_id AND public.approval_can_view(c.approval_request_id)));
CREATE POLICY "approval_comment_mentions_select" ON public.approval_comment_mentions
  FOR SELECT TO authenticated USING (public.approval_can_view(approval_request_id));
CREATE POLICY "approval_attachments_select" ON public.approval_attachments
  FOR SELECT TO authenticated USING (public.approval_can_view(approval_request_id));
CREATE POLICY "announcement_attachments_select" ON public.announcement_attachments
  FOR SELECT TO authenticated USING (public.can_view_announcement(announcement_id));

-- ============ 4. NGHIỆP VỤ BÌNH LUẬN (SECURITY DEFINER) ============
CREATE OR REPLACE FUNCTION public.approval_comment_post(_request uuid, _body text, _mentions uuid[] DEFAULT '{}'::uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me uuid := auth.uid();
  _comment uuid;
  _title text;
  _ids uuid[];
  _u uuid;
BEGIN
  IF NOT public.approval_can_comment(_request) THEN
    RAISE EXCEPTION 'Bạn không có quyền bình luận trong yêu cầu này';
  END IF;
  IF coalesce(btrim(_body), '') = '' THEN RAISE EXCEPTION 'Nội dung bình luận không được để trống'; END IF;
  IF length(btrim(_body)) > 4000 THEN RAISE EXCEPTION 'Bình luận tối đa 4000 ký tự'; END IF;

  SELECT title INTO _title FROM public.approval_requests WHERE id = _request;

  INSERT INTO public.approval_comments (approval_request_id, author_id, body)
  VALUES (_request, _me, btrim(_body)) RETURNING id INTO _comment;

  PERFORM public.write_audit('approval.comment_created', 'approval_request', _request, NULL,
    jsonb_build_object('comment_id', _comment), '{}'::jsonb);

  IF coalesce(array_length(_mentions, 1), 0) > 0 THEN
    IF NOT public.approval_can_mention(_request) THEN
      RAISE EXCEPTION 'Chỉ người gửi và người phê duyệt được nhắc tên';
    END IF;
    SELECT array_agg(DISTINCT p.id) INTO _ids FROM public.profiles p
     WHERE p.id = ANY(_mentions) AND p.status = 'active' AND p.id <> _me;
    IF _ids IS NULL THEN RAISE EXCEPTION 'Danh sách nhắc tên không hợp lệ'; END IF;

    INSERT INTO public.approval_comment_mentions (comment_id, approval_request_id, user_id)
    SELECT _comment, _request, u FROM unnest(_ids) AS u
    ON CONFLICT DO NOTHING;

    PERFORM public.write_audit('approval.comment_mentioned', 'approval_request', _request, NULL,
      jsonb_build_object('comment_id', _comment, 'mentioned', _ids),
      jsonb_build_object('access_granted', true));

    FOREACH _u IN ARRAY _ids LOOP
      PERFORM public.notify_user(_u, 'approval.mentioned', 'Bạn được nhắc tên trong yêu cầu phê duyệt',
        coalesce(_title, 'Yêu cầu phê duyệt'), 'approval_request', _request,
        '/approvals/' || _request::text, 'approval.mention:' || _comment::text || ':' || _u::text);
    END LOOP;
  END IF;

  -- Thông báo bình luận mới cho người gửi, người phê duyệt hiện tại và người đã được mention.
  FOR _u IN
    SELECT DISTINCT x FROM (
      SELECT r.sender_id AS x FROM public.approval_requests r WHERE r.id = _request
      UNION SELECT d.approver_id FROM public.approval_decisions d
        WHERE d.approval_request_id = _request AND d.decision_status <> 'replaced'
      UNION SELECT m.user_id FROM public.approval_comment_mentions m
        WHERE m.approval_request_id = _request
    ) s WHERE x IS NOT NULL AND x <> _me
      AND x NOT IN (SELECT user_id FROM public.approval_comment_mentions WHERE comment_id = _comment)
  LOOP
    PERFORM public.notify_user(_u, 'approval.comment_created', 'Có bình luận mới trong yêu cầu phê duyệt',
      coalesce(_title, 'Yêu cầu phê duyệt'), 'approval_request', _request,
      '/approvals/' || _request::text, 'approval.comment:' || _comment::text || ':' || _u::text);
  END LOOP;

  RETURN _comment;
END; $$;

CREATE OR REPLACE FUNCTION public.approval_comment_edit(_comment uuid, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.approval_comments%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.approval_comments WHERE id = _comment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bình luận'; END IF;
  IF c.author_id <> auth.uid() THEN RAISE EXCEPTION 'Chỉ tác giả được sửa bình luận của mình'; END IF;
  IF c.hidden_at IS NOT NULL THEN RAISE EXCEPTION 'Bình luận đã bị ẩn'; END IF;
  IF coalesce(btrim(_body), '') = '' THEN RAISE EXCEPTION 'Nội dung bình luận không được để trống'; END IF;
  IF btrim(_body) = c.body THEN RETURN; END IF;

  INSERT INTO public.approval_comment_edits (comment_id, previous_body, edited_by)
  VALUES (c.id, c.body, auth.uid());

  UPDATE public.approval_comments SET body = btrim(_body), is_edited = true WHERE id = c.id;

  PERFORM public.write_audit('approval.comment_edited', 'approval_request', c.approval_request_id,
    jsonb_build_object('comment_id', c.id), jsonb_build_object('comment_id', c.id), '{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.approval_comment_set_hidden(_comment uuid, _hidden boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.approval_comments%ROWTYPE;
BEGIN
  IF public.current_app_role() NOT IN ('admin', 'cmo') THEN
    RAISE EXCEPTION 'Chỉ Admin hoặc CMO được ẩn bình luận';
  END IF;
  SELECT * INTO c FROM public.approval_comments WHERE id = _comment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bình luận'; END IF;
  IF _hidden AND coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'Phải nhập lý do khi ẩn bình luận';
  END IF;

  UPDATE public.approval_comments
     SET hidden_at = CASE WHEN _hidden THEN now() ELSE NULL END,
         hidden_by = CASE WHEN _hidden THEN auth.uid() ELSE NULL END,
         hidden_reason = CASE WHEN _hidden THEN btrim(_reason) ELSE NULL END
   WHERE id = c.id;

  PERFORM public.write_audit(
    CASE WHEN _hidden THEN 'approval.comment_hidden' ELSE 'approval.comment_unhidden' END,
    'approval_request', c.approval_request_id, NULL,
    jsonb_build_object('comment_id', c.id, 'reason', nullif(btrim(coalesce(_reason, '')), '')), '{}'::jsonb);
END; $$;

-- ============ 5. NGHIỆP VỤ TỆP ĐÍNH KÈM ============
CREATE OR REPLACE FUNCTION public.attachment_check_file(_name text, _size bigint, _mime text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
BEGIN
  IF coalesce(btrim(_name), '') = '' THEN RAISE EXCEPTION 'Tên tệp không hợp lệ'; END IF;
  IF _size IS NULL OR _size <= 0 THEN RAISE EXCEPTION 'Tệp rỗng'; END IF;
  IF _size > 10485760 THEN RAISE EXCEPTION 'Dung lượng tệp tối đa 10 MB'; END IF;
  IF _mime NOT IN (
    'application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ) THEN RAISE EXCEPTION 'Định dạng tệp không được phép'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.approval_attachment_add(_request uuid, _path text, _name text, _size bigint, _mime text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.approval_requests%ROWTYPE; _id uuid;
BEGIN
  SELECT * INTO r FROM public.approval_requests WHERE id = _request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu phê duyệt'; END IF;
  IF r.sender_id <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được đính kèm tệp'; END IF;
  PERFORM public.attachment_check_file(_name, _size, _mime);
  IF _path IS NULL OR _path NOT LIKE 'approval/' || _request::text || '/%' THEN
    RAISE EXCEPTION 'Đường dẫn tệp không hợp lệ';
  END IF;

  INSERT INTO public.approval_attachments
    (approval_request_id, version_no, storage_path, file_name, file_size, mime_type, uploaded_by)
  VALUES (_request, r.current_version, _path, btrim(_name), _size, _mime, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.write_audit('approval.attachment_added', 'approval_request', _request, NULL,
    jsonb_build_object('attachment_id', _id, 'file_name', btrim(_name), 'version_no', r.current_version), '{}'::jsonb);
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.approval_attachment_remove(_attachment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.approval_attachments%ROWTYPE; r public.approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.approval_attachments WHERE id = _attachment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tệp'; END IF;
  SELECT * INTO r FROM public.approval_requests WHERE id = a.approval_request_id;
  IF r.sender_id <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được gỡ tệp'; END IF;
  IF a.version_no <> r.current_version THEN RAISE EXCEPTION 'Không thể gỡ tệp của phiên bản trước'; END IF;
  IF a.removed_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.approval_attachments SET removed_at = now(), removed_by = auth.uid() WHERE id = a.id;
  PERFORM public.write_audit('approval.attachment_removed', 'approval_request', a.approval_request_id, NULL,
    jsonb_build_object('attachment_id', a.id, 'file_name', a.file_name, 'version_no', a.version_no), '{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.announcement_attachment_add(_announcement uuid, _path text, _name text, _size bigint, _mime text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.can_edit_announcement(_announcement)
     AND public.announcement_author(_announcement) <> auth.uid() THEN
    RAISE EXCEPTION 'Chỉ người soạn thông báo được đính kèm tệp';
  END IF;
  PERFORM public.attachment_check_file(_name, _size, _mime);
  IF _path IS NULL OR _path NOT LIKE 'announcement/' || _announcement::text || '/%' THEN
    RAISE EXCEPTION 'Đường dẫn tệp không hợp lệ';
  END IF;

  INSERT INTO public.announcement_attachments
    (announcement_id, storage_path, file_name, file_size, mime_type, uploaded_by)
  VALUES (_announcement, _path, btrim(_name), _size, _mime, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.write_audit('announcement.attachment_added', 'announcement', _announcement, NULL,
    jsonb_build_object('attachment_id', _id, 'file_name', btrim(_name)), '{}'::jsonb);
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.announcement_attachment_remove(_attachment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.announcement_attachments%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.announcement_attachments WHERE id = _attachment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tệp'; END IF;
  IF public.announcement_author(a.announcement_id) <> auth.uid() THEN
    RAISE EXCEPTION 'Chỉ người soạn thông báo được gỡ tệp';
  END IF;
  IF a.removed_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.announcement_attachments SET removed_at = now(), removed_by = auth.uid() WHERE id = a.id;
  PERFORM public.write_audit('announcement.attachment_removed', 'announcement', a.announcement_id, NULL,
    jsonb_build_object('attachment_id', a.id, 'file_name', a.file_name), '{}'::jsonb);
END; $$;

-- ============ 6. THÔNG BÁO CHO SỰ KIỆN PHÊ DUYỆT (trigger, không đổi business rule) ============
CREATE OR REPLACE FUNCTION public.notify_approval_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _u uuid; _sender text; _event text; _label text;
BEGIN
  SELECT display_name INTO _sender FROM public.profiles WHERE id = NEW.submitted_by;
  IF NEW.version_no = 1 THEN
    _event := 'approval.requested'; _label := 'Bạn có yêu cầu phê duyệt mới';
  ELSE
    _event := 'approval.resubmitted'; _label := 'Yêu cầu phê duyệt đã được sửa và gửi lại';
  END IF;

  FOREACH _u IN ARRAY coalesce(NEW.approver_ids, '{}'::uuid[]) LOOP
    PERFORM public.notify_user(_u, _event, _label,
      NEW.title || ' — Người gửi: ' || coalesce(_sender, 'Không rõ')
        || ' — Hạn: ' || to_char(NEW.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI'),
      'approval_request', NEW.approval_request_id,
      '/approvals/' || NEW.approval_request_id::text,
      _event || ':' || NEW.approval_request_id::text || ':' || NEW.version_no::text || ':' || _u::text);
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER notify_approval_version_created
AFTER INSERT ON public.approval_request_versions
FOR EACH ROW EXECUTE FUNCTION public.notify_approval_version();

CREATE OR REPLACE FUNCTION public.notify_approval_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _u uuid; _event text; _label text; _body text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'approved' THEN
    _event := 'approval.approved'; _label := 'Yêu cầu phê duyệt đã được duyệt';
  ELSIF NEW.status = 'rejected' THEN
    _event := 'approval.rejected'; _label := 'Yêu cầu phê duyệt bị từ chối';
  ELSIF NEW.status = 'withdrawn' THEN
    _event := 'approval.withdrawn'; _label := 'Yêu cầu phê duyệt đã được thu hồi';
  ELSE
    RETURN NEW;
  END IF;

  _body := NEW.title;

  IF NEW.status = 'withdrawn' THEN
    FOR _u IN SELECT approver_id FROM public.approval_decisions
               WHERE approval_request_id = NEW.id AND version_no = NEW.current_version
                 AND decision_status = 'pending'
    LOOP
      PERFORM public.notify_user(_u, _event, _label, _body, 'approval_request', NEW.id,
        '/approvals/' || NEW.id::text, _event || ':' || NEW.id::text || ':' || NEW.current_version::text || ':' || _u::text);
    END LOOP;
  ELSE
    PERFORM public.notify_user(NEW.sender_id, _event, _label, _body, 'approval_request', NEW.id,
      '/approvals/' || NEW.id::text, _event || ':' || NEW.id::text || ':' || NEW.current_version::text);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER notify_approval_status_changed
AFTER UPDATE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_approval_status();

CREATE OR REPLACE FUNCTION public.notify_approval_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _title text; _actor text; _sender uuid;
BEGIN
  IF NEW.decision_status IS NOT DISTINCT FROM OLD.decision_status THEN RETURN NEW; END IF;
  SELECT title, sender_id INTO _title, _sender FROM public.approval_requests WHERE id = NEW.approval_request_id;

  IF NEW.decision_status IN ('approved', 'rejected') THEN
    SELECT display_name INTO _actor FROM public.profiles WHERE id = NEW.approver_id;
    PERFORM public.notify_user(_sender, 'approval.decision_recorded', 'Có quyết định mới cho yêu cầu phê duyệt',
      coalesce(_title, 'Yêu cầu phê duyệt') || ' — ' || coalesce(_actor, 'Người phê duyệt') || ': '
        || CASE WHEN NEW.decision_status = 'approved' THEN 'Đồng ý' ELSE 'Từ chối' END,
      'approval_request', NEW.approval_request_id, '/approvals/' || NEW.approval_request_id::text,
      'approval.decision:' || NEW.id::text || ':' || NEW.decision_status);
  ELSIF NEW.decision_status = 'replaced' AND NEW.replaced_by IS NOT NULL THEN
    PERFORM public.notify_user(NEW.replaced_by, 'approval.approver_replaced', 'Bạn được chỉ định phê duyệt thay',
      coalesce(_title, 'Yêu cầu phê duyệt'), 'approval_request', NEW.approval_request_id,
      '/approvals/' || NEW.approval_request_id::text, 'approval.replaced:' || NEW.id::text);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER notify_approval_decision_changed
AFTER UPDATE ON public.approval_decisions
FOR EACH ROW EXECUTE FUNCTION public.notify_approval_decision();

-- ============ 7. QUYỀN GỌI HÀM (mặc định đã bị thu hồi ở gói bảo mật trước) ============
REVOKE ALL ON FUNCTION public.approval_comment_post(uuid, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_comment_edit(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_comment_set_hidden(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_attachment_add(uuid, text, text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_attachment_remove(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.announcement_attachment_add(uuid, text, text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.announcement_attachment_remove(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_can_comment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_can_mention(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attachment_check_file(text, bigint, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approval_comment_post(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_comment_edit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_comment_set_hidden(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_attachment_add(uuid, text, text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_attachment_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_attachment_add(uuid, text, text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_attachment_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_can_comment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_can_mention(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_can_view(uuid) TO authenticated;