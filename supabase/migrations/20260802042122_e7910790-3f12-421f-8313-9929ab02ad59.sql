CREATE OR REPLACE FUNCTION public.document_submit(_document uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v record; _approver uuid; _actor uuid := auth.uid();
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;
  IF NOT public.can_manage_document(_document) THEN
    RAISE EXCEPTION 'Bạn không có quyền gửi duyệt tài liệu này.';
  END IF;

  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF v.status <> 'draft' THEN RAISE EXCEPTION 'Chỉ gửi duyệt được bản nháp.'; END IF;

  IF coalesce(btrim(d.name),'') = '' OR coalesce(btrim(v.source_url),'') = '' OR v.effective_from IS NULL THEN
    RAISE EXCEPTION 'Tài liệu còn thiếu dữ liệu bắt buộc.';
  END IF;
  IF v.source_url !~* '^https?://' THEN RAISE EXCEPTION 'Đường dẫn tài liệu không hợp lệ.'; END IF;
  IF NOT public.is_active_account(d.owner_id) THEN
    RAISE EXCEPTION 'Người phụ trách không còn hoạt động. Hãy đổi người phụ trách trước khi gửi duyệt.';
  END IF;

  _approver := public.document_resolve_approver(_document, ARRAY[_actor]);
  IF _approver IS NULL AND public.is_system_admin(_actor) THEN
    -- Không còn người duyệt hợp lệ nào khác: chuyển sang luồng tự duyệt ngoại lệ có lý do.
    _approver := _actor;
  END IF;
  IF _approver IS NULL THEN
    RAISE EXCEPTION 'Không tìm được người duyệt hợp lệ cho phạm vi tài liệu này. Hãy liên hệ CMO hoặc Admin.';
  END IF;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET status = 'pending_approval', submitted_by = _actor, submitted_at = now(),
         approver_id = _approver, alt_approver_id = NULL,
         approver_assigned_by = NULL, approver_assigned_at = NULL,
         withdrawn_at = NULL, withdrawn_by = NULL,
         rejected_by = NULL, rejected_at = NULL, reject_reason = NULL
   WHERE id = v.id;
  PERFORM set_config('cen.doc_workflow','', true);

  PERFORM public.notify_user(_approver, 'document.approval_requested', 'Tài liệu chờ bạn duyệt',
    d.display_name, 'document', d.id, '/documents/' || d.id::text,
    'doc-approval-' || v.id::text || '-' || extract(epoch from now())::bigint::text);
  PERFORM public.write_audit('document.submitted','document_version', v.id,
    jsonb_build_object('status', v.status),
    jsonb_build_object('status','pending_approval','approver_id',_approver), '{}'::jsonb);
  RETURN _approver;
END; $$;