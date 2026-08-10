-- DOC-06: kiểm soát sau phát hành ------------------------------------------
ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS link_resolved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS link_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS restore_reason text,
  ADD COLUMN IF NOT EXISTS status_before_archive public.document_version_status;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS restore_reason text;

-- Cho phép RPC workflow ghi các cột DOC-06 (trigger vẫn chặn đường ghi trực tiếp).
CREATE OR REPLACE FUNCTION public.enforce_document_version_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT coalesce(max(v.version_no), 0) + 1 INTO NEW.version_no
      FROM public.document_versions v WHERE v.document_id = NEW.document_id;
    NEW.created_by := coalesce(auth.uid(), NEW.created_by);
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Phiên bản mới luôn bắt đầu ở trạng thái nháp.';
    END IF;
    RETURN NEW;
  END IF;

  NEW.version_no := OLD.version_no;
  NEW.document_id := OLD.document_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();

  IF coalesce(current_setting('cen.doc_workflow', true), '') <> 'on' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approver_id IS DISTINCT FROM OLD.approver_id
       OR NEW.alt_approver_id IS DISTINCT FROM OLD.alt_approver_id
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
       OR NEW.self_approved IS DISTINCT FROM OLD.self_approved
       OR NEW.ever_submitted IS DISTINCT FROM OLD.ever_submitted
       OR NEW.needs_link_review IS DISTINCT FROM OLD.needs_link_review
       OR NEW.link_reported_by IS DISTINCT FROM OLD.link_reported_by
       OR NEW.link_resolved_by IS DISTINCT FROM OLD.link_resolved_by
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
       OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
       OR NEW.restored_at IS DISTINCT FROM OLD.restored_at
       OR NEW.restored_by IS DISTINCT FROM OLD.restored_by
       OR NEW.status_before_archive IS DISTINCT FROM OLD.status_before_archive THEN
      RAISE EXCEPTION 'Chỉ được thay đổi trạng thái duyệt/lưu trữ qua chức năng tương ứng.';
    END IF;
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Chỉ sửa được nội dung khi phiên bản đang ở trạng thái nháp.';
    END IF;
  END IF;

  IF NEW.status <> 'draft' OR OLD.ever_submitted THEN
    NEW.ever_submitted := true;
  END IF;
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.submitted_by AND NOT NEW.self_approved THEN
    RAISE EXCEPTION 'Không được tự duyệt phiên bản do chính mình gửi duyệt.';
  END IF;
  IF NEW.self_approved AND coalesce(btrim(NEW.self_approval_reason),'') = '' THEN
    RAISE EXCEPTION 'Ngoại lệ tự duyệt phải có lý do.';
  END IF;
  RETURN NEW;
END; $function$;

-- Nhận dạng tài liệu nguồn từ URL: host + khóa tài liệu dài nhất trong path.
CREATE OR REPLACE FUNCTION public.document_link_identity(_url text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  WITH clean AS (
    SELECT lower(regexp_replace(coalesce(_url,''), '^https?://', '')) AS u
  ), parts AS (
    SELECT split_part(split_part(split_part(u,'#',1),'?',1),'/',1) AS host,
           split_part(split_part(u,'#',1),'?',1) AS path
      FROM clean
  )
  SELECT regexp_replace(host,'^www\.','') || '|' ||
         coalesce((
           SELECT tok FROM unnest(string_to_array(path,'/')) AS tok
            WHERE length(tok) >= 12
            ORDER BY length(tok) DESC LIMIT 1
         ), rtrim(path,'/'))
    FROM parts;
$$;

-- Ai được xử lý link lỗi: người quản lý tài liệu (chủ sở hữu, người tạo, leader phạm vi) hoặc CMO/Admin.
CREATE OR REPLACE FUNCTION public.can_resolve_document_link(_document uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_active_account(auth.uid())
     AND (public.is_system_admin(auth.uid()) OR public.can_manage_document(_document));
$$;

-- 1) Báo link lỗi ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.document_report_link(_document uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v record; _actor uuid := auth.uid();
BEGIN
  IF NOT public.is_active_account(_actor) THEN
    RAISE EXCEPTION 'Tài khoản không còn hoạt động.';
  END IF;
  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;
  IF NOT public.can_view_document(_document) THEN
    RAISE EXCEPTION 'Bạn không có quyền xem tài liệu này.';
  END IF;

  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF v.status = 'draft' THEN
    RAISE EXCEPTION 'Tài liệu chưa phát hành nên chưa cần báo link lỗi.';
  END IF;
  IF v.needs_link_review THEN
    RAISE EXCEPTION 'Tài liệu đang chờ kiểm tra đường dẫn, không cần báo thêm.';
  END IF;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET needs_link_review = true,
         link_reported_by = _actor,
         link_reported_at = now(),
         link_review_note = nullif(btrim(_note), ''),
         link_resolved_by = NULL,
         link_resolved_at = NULL
   WHERE id = v.id;
  PERFORM set_config('cen.doc_workflow','', true);

  PERFORM public.notify_user(d.owner_id, 'document.link_reported', 'Tài liệu bị báo link lỗi',
    d.display_name, 'document', d.id, '/documents/' || d.id::text,
    'doc-link-' || v.id::text || '-' || extract(epoch from now())::bigint::text);
  IF d.created_by IS DISTINCT FROM d.owner_id THEN
    PERFORM public.notify_user(d.created_by, 'document.link_reported', 'Tài liệu bị báo link lỗi',
      d.display_name, 'document', d.id, '/documents/' || d.id::text,
      'doc-link-c-' || v.id::text || '-' || extract(epoch from now())::bigint::text);
  END IF;
  PERFORM public.write_audit('document.link_reported','document_version', v.id,
    jsonb_build_object('needs_link_review', false),
    jsonb_build_object('needs_link_review', true, 'note', nullif(btrim(_note),''),
                       'reported_by', _actor), '{}'::jsonb);
END; $$;

-- 2) Xác nhận đã xử lý link --------------------------------------------------
CREATE OR REPLACE FUNCTION public.document_resolve_link(
  _document uuid, _note text DEFAULT NULL, _new_url text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v record; _actor uuid := auth.uid(); _url text := nullif(btrim(_new_url),'');
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;
  IF NOT public.can_resolve_document_link(_document) THEN
    RAISE EXCEPTION 'Bạn không có quyền xử lý cảnh báo link của tài liệu này.';
  END IF;

  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF NOT v.needs_link_review THEN
    RAISE EXCEPTION 'Tài liệu không có cảnh báo đường dẫn cần xử lý.';
  END IF;

  IF _url IS NOT NULL AND _url <> v.source_url THEN
    IF _url !~* '^https?://' THEN RAISE EXCEPTION 'Đường dẫn mới không hợp lệ.'; END IF;
    IF public.document_link_identity(_url) IS DISTINCT FROM public.document_link_identity(v.source_url) THEN
      RAISE EXCEPTION 'Đường dẫn mới trỏ đến tài liệu khác. Hãy tạo phiên bản mới thay vì đổi đường dẫn.';
    END IF;
  END IF;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET needs_link_review = false,
         link_resolved_by = _actor,
         link_resolved_at = now(),
         link_review_note = coalesce(nullif(btrim(_note),''), link_review_note),
         source_url = coalesce(_url, source_url)
   WHERE id = v.id;
  IF _url IS NOT NULL THEN
    UPDATE public.documents SET source_url = _url WHERE id = d.id;
  END IF;
  PERFORM set_config('cen.doc_workflow','', true);

  IF v.link_reported_by IS NOT NULL AND v.link_reported_by <> _actor THEN
    PERFORM public.notify_user(v.link_reported_by, 'document.link_resolved',
      'Cảnh báo link tài liệu đã được xử lý', d.display_name, 'document', d.id,
      '/documents/' || d.id::text,
      'doc-link-fix-' || v.id::text || '-' || extract(epoch from now())::bigint::text);
  END IF;
  PERFORM public.write_audit('document.link_resolved','document_version', v.id,
    jsonb_build_object('needs_link_review', true, 'source_url', v.source_url),
    jsonb_build_object('needs_link_review', false, 'source_url', coalesce(_url, v.source_url),
                       'resolved_by', _actor, 'note', nullif(btrim(_note),'')), '{}'::jsonb);
END; $$;

-- 3) Lưu trữ -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.document_archive(_document uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v record; _actor uuid := auth.uid(); _r text := nullif(btrim(_reason),'');
BEGIN
  IF NOT public.is_system_admin(_actor) THEN
    RAISE EXCEPTION 'Chỉ CMO hoặc Quản trị viên được lưu trữ tài liệu.';
  END IF;
  IF _r IS NULL THEN RAISE EXCEPTION 'Bắt buộc nhập lý do lưu trữ.'; END IF;

  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;
  IF d.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Tài liệu đã ở trạng thái lưu trữ.'; END IF;

  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF v.approved_at IS NULL OR v.status NOT IN ('active','scheduled','expired') THEN
    RAISE EXCEPTION 'Chỉ lưu trữ được tài liệu đã được duyệt.';
  END IF;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET status = 'archived', status_before_archive = v.status,
         archived_at = now(), archived_by = _actor, archive_reason = _r,
         restored_at = NULL, restored_by = NULL, restore_reason = NULL
   WHERE id = v.id;
  UPDATE public.documents
     SET archived_at = now(), archived_by = _actor, archive_reason = _r,
         restored_at = NULL, restored_by = NULL, restore_reason = NULL
   WHERE id = d.id;
  PERFORM set_config('cen.doc_workflow','', true);

  PERFORM public.notify_user(d.owner_id, 'document.archived', 'Tài liệu đã được lưu trữ',
    d.display_name, 'document', d.id, '/documents/' || d.id::text,
    'doc-archived-' || v.id::text || '-' || extract(epoch from now())::bigint::text);
  PERFORM public.write_audit('document.archived','document_version', v.id,
    jsonb_build_object('status', v.status),
    jsonb_build_object('status','archived','archived_by',_actor,'reason',_r), '{}'::jsonb);
END; $$;

-- 4) Khôi phục ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.document_restore(_document uuid, _reason text)
RETURNS public.document_version_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d record; v record; _actor uuid := auth.uid(); _r text := nullif(btrim(_reason),'');
        _next public.document_version_status; _newer int;
BEGIN
  IF NOT public.is_system_admin(_actor) THEN
    RAISE EXCEPTION 'Chỉ CMO hoặc Quản trị viên được khôi phục tài liệu.';
  END IF;
  IF _r IS NULL THEN RAISE EXCEPTION 'Bắt buộc nhập lý do khôi phục.'; END IF;

  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;

  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document AND status = 'archived'
   ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tài liệu không có phiên bản đang lưu trữ.'; END IF;

  SELECT count(*) INTO _newer FROM public.document_versions x
   WHERE x.document_id = _document AND x.version_no > v.version_no;
  IF _newer > 0 THEN
    RAISE EXCEPTION 'Đã có phiên bản mới hơn nên không thể khôi phục phiên bản này.';
  END IF;

  IF v.superseded_by_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'Phiên bản này đã bị phiên bản khác thay thế.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_versions x
     WHERE x.document_id = _document AND x.id <> v.id
       AND x.status IN ('active','scheduled')
  ) THEN
    RAISE EXCEPTION 'Đang có phiên bản khác hiệu lực hoặc đã lên lịch nên không thể khôi phục.';
  END IF;

  -- Không ép phiên bản hết hạn thành đang hiệu lực.
  _next := CASE
    WHEN v.effective_to IS NOT NULL AND v.effective_to < current_date THEN 'expired'
    WHEN v.effective_from > current_date THEN 'scheduled'
    ELSE 'active' END;
  IF coalesce(v.status_before_archive,'active') = 'expired' AND _next = 'active' THEN
    _next := 'expired';
  END IF;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET status = _next, archived_at = NULL, archived_by = NULL,
         status_before_archive = NULL,
         restored_at = now(), restored_by = _actor, restore_reason = _r
   WHERE id = v.id;
  UPDATE public.documents
     SET archived_at = NULL, archived_by = NULL,
         restored_at = now(), restored_by = _actor, restore_reason = _r
   WHERE id = d.id;
  PERFORM set_config('cen.doc_workflow','', true);

  PERFORM public.notify_user(d.owner_id, 'document.restored', 'Tài liệu đã được khôi phục',
    d.display_name, 'document', d.id, '/documents/' || d.id::text,
    'doc-restored-' || v.id::text || '-' || extract(epoch from now())::bigint::text);
  PERFORM public.write_audit('document.restored','document_version', v.id,
    jsonb_build_object('status','archived'),
    jsonb_build_object('status', _next, 'restored_by', _actor, 'reason', _r), '{}'::jsonb);
  RETURN _next;
END; $$;

REVOKE ALL ON FUNCTION public.document_link_identity(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_resolve_document_link(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.document_report_link(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.document_resolve_link(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.document_archive(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.document_restore(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_link_identity(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_resolve_document_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_report_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_resolve_link(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_archive(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_restore(uuid, text) TO authenticated;