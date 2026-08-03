CREATE OR REPLACE FUNCTION public.document_publish_now(_document uuid)
RETURNS document_version_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE d record; v record; _actor uuid := auth.uid(); _next document_version_status;
BEGIN
  IF _actor IS NULL OR NOT public.is_system_admin(_actor) THEN
    RAISE EXCEPTION 'Bạn không có quyền phát hành tài liệu.';
  END IF;

  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;
  IF NOT public.can_manage_document(_document) THEN
    RAISE EXCEPTION 'Bạn không có quyền phát hành tài liệu này.';
  END IF;

  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF v.status <> 'draft' THEN RAISE EXCEPTION 'Chỉ phát hành được bản nháp.'; END IF;

  IF coalesce(btrim(d.name),'') = '' OR coalesce(btrim(v.source_url),'') = '' OR v.effective_from IS NULL THEN
    RAISE EXCEPTION 'Tài liệu còn thiếu dữ liệu bắt buộc.';
  END IF;
  IF v.source_url !~* '^https?://' THEN RAISE EXCEPTION 'Đường dẫn tài liệu không hợp lệ.'; END IF;
  IF NOT public.is_active_account(d.owner_id) THEN
    RAISE EXCEPTION 'Người phụ trách không còn hoạt động.';
  END IF;

  _next := CASE WHEN v.effective_from > current_date THEN 'scheduled' ELSE 'active' END;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET status = _next,
         submitted_by = _actor, submitted_at = now(),
         approver_id = _actor, alt_approver_id = NULL,
         approved_by = _actor, approved_at = now(),
         self_approved = true,
         self_approval_reason = 'Admin/CMO phát hành trực tiếp khi tạo tài liệu.',
         withdrawn_at = NULL, withdrawn_by = NULL,
         rejected_by = NULL, rejected_at = NULL, reject_reason = NULL
   WHERE id = v.id;
  PERFORM set_config('cen.doc_workflow','', true);

  IF d.owner_id IS DISTINCT FROM _actor THEN
    PERFORM public.notify_user(d.owner_id, 'document.approved', 'Tài liệu đã được phát hành',
      d.display_name, 'document', d.id, '/documents/' || d.id::text,
      'doc-published-' || v.id::text);
  END IF;

  PERFORM public.write_audit('document.published','document_version', v.id,
    jsonb_build_object('status', v.status),
    jsonb_build_object('status', _next, 'approved_by', _actor, 'published_by', _actor), '{}'::jsonb);
  RETURN _next;
END; $function$;

REVOKE ALL ON FUNCTION public.document_publish_now(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_publish_now(uuid) TO authenticated;