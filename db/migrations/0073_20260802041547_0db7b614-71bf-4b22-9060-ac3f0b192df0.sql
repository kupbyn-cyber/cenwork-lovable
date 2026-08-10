-- ============ DOC-04: cột bổ sung ============
ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS alt_approver_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approver_assigned_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approver_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS document_versions_approver_idx
  ON public.document_versions (approver_id) WHERE status = 'pending_approval';

-- ============ Chọn người duyệt ============
CREATE OR REPLACE FUNCTION public.document_pick_admin(_exclude uuid[])
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('cmo','admin')
    AND p.status = 'active'
    AND NOT (ur.user_id = ANY (coalesce(_exclude, ARRAY[]::uuid[])))
  ORDER BY (ur.role = 'cmo') DESC, p.display_name
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.document_resolve_approver(_document uuid, _exclude uuid[] DEFAULT ARRAY[]::uuid[])
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record;
  _ex uuid[] := coalesce(_exclude, ARRAY[]::uuid[]);
  _leader uuid;
  _owner uuid;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;

  _ex := _ex || d.created_by;

  IF d.scope = 'team' THEN
    SELECT t.leader_id INTO _leader FROM public.teams t WHERE t.id = d.team_id;
    IF _leader IS NOT NULL AND NOT (_leader = ANY (_ex)) AND public.is_active_account(_leader) THEN
      RETURN _leader;
    END IF;
    RETURN public.document_pick_admin(_ex);
  END IF;

  IF d.scope = 'project' THEN
    SELECT p.owner_id INTO _owner FROM public.projects p WHERE p.id = d.project_id;
    IF _owner IS NOT NULL AND NOT (_owner = ANY (_ex)) AND public.is_active_account(_owner) THEN
      RETURN _owner;
    END IF;
    SELECT t.leader_id INTO _leader
      FROM public.project_teams pt
      JOIN public.teams t ON t.id = pt.team_id
     WHERE pt.project_id = d.project_id
       AND t.leader_id IS NOT NULL
       AND NOT (t.leader_id = ANY (_ex))
       AND public.is_active_account(t.leader_id)
     LIMIT 1;
    IF _leader IS NOT NULL THEN RETURN _leader; END IF;
    RETURN public.document_pick_admin(_ex);
  END IF;

  RETURN public.document_pick_admin(_ex);
END; $$;

-- ============ Chặn đổi trạng thái ngoài luồng duyệt ============
CREATE OR REPLACE FUNCTION public.enforce_document_version_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
       OR NEW.ever_submitted IS DISTINCT FROM OLD.ever_submitted THEN
      RAISE EXCEPTION 'Chỉ được thay đổi trạng thái duyệt qua chức năng duyệt tài liệu.';
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
END; $$;

-- ============ Gửi duyệt ============
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

-- ============ Thu hồi ============
CREATE OR REPLACE FUNCTION public.document_withdraw(_document uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v record; _actor uuid := auth.uid();
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;
  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF v.status <> 'pending_approval' THEN RAISE EXCEPTION 'Tài liệu không ở trạng thái chờ duyệt.'; END IF;
  IF v.approved_at IS NOT NULL OR v.rejected_at IS NOT NULL THEN
    RAISE EXCEPTION 'Yêu cầu duyệt đã được xử lý, không thể thu hồi.';
  END IF;
  IF v.submitted_by IS DISTINCT FROM _actor THEN
    RAISE EXCEPTION 'Chỉ người gửi duyệt mới được thu hồi.';
  END IF;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET status = 'draft', withdrawn_at = now(), withdrawn_by = _actor,
         approver_id = NULL, alt_approver_id = NULL
   WHERE id = v.id;
  PERFORM set_config('cen.doc_workflow','', true);

  PERFORM public.notify_user(coalesce(v.alt_approver_id, v.approver_id), 'document.approval_withdrawn',
    'Yêu cầu duyệt đã được thu hồi', d.display_name, 'document', d.id, '/documents/' || d.id::text,
    'doc-withdraw-' || v.id::text || '-' || extract(epoch from now())::bigint::text);
  PERFORM public.write_audit('document.withdrawn','document_version', v.id,
    jsonb_build_object('status','pending_approval'), jsonb_build_object('status','draft'), '{}'::jsonb);
END; $$;

-- ============ Duyệt ============
CREATE OR REPLACE FUNCTION public.document_approve(_document uuid, _self_reason text DEFAULT NULL)
RETURNS document_version_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record; v record; _actor uuid := auth.uid();
  _self boolean := false; _other uuid; _next document_version_status;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;
  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF v.status <> 'pending_approval' THEN RAISE EXCEPTION 'Tài liệu không ở trạng thái chờ duyệt.'; END IF;
  IF v.approved_at IS NOT NULL OR v.rejected_at IS NOT NULL THEN
    RAISE EXCEPTION 'Yêu cầu duyệt đã được xử lý.';
  END IF;

  _self := (_actor = v.submitted_by) OR (_actor = d.created_by);

  IF _self THEN
    IF NOT public.is_system_admin(_actor) THEN
      RAISE EXCEPTION 'Bạn không được duyệt tài liệu do chính mình tạo hoặc gửi duyệt.';
    END IF;
    IF coalesce(btrim(_self_reason),'') = '' THEN
      RAISE EXCEPTION 'Tự duyệt ngoại lệ bắt buộc nhập lý do.';
    END IF;
    _other := public.document_resolve_approver(_document, ARRAY[_actor]);
    IF _other IS NOT NULL THEN
      RAISE EXCEPTION 'Vẫn còn người duyệt hợp lệ khác nên không thể tự duyệt ngoại lệ.';
    END IF;
  ELSE
    IF _actor IS DISTINCT FROM v.approver_id AND _actor IS DISTINCT FROM v.alt_approver_id THEN
      RAISE EXCEPTION 'Bạn không phải người duyệt của tài liệu này.';
    END IF;
    IF NOT public.is_active_account(_actor) THEN
      RAISE EXCEPTION 'Tài khoản không còn hoạt động.';
    END IF;
  END IF;

  _next := CASE WHEN v.effective_from > current_date THEN 'scheduled' ELSE 'active' END;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET status = _next, approved_by = _actor, approved_at = now(),
         self_approved = _self,
         self_approval_reason = CASE WHEN _self THEN btrim(_self_reason) ELSE NULL END
   WHERE id = v.id;
  PERFORM set_config('cen.doc_workflow','', true);

  PERFORM public.notify_user(d.created_by, 'document.approved', 'Tài liệu đã được duyệt',
    d.display_name, 'document', d.id, '/documents/' || d.id::text,
    'doc-approved-' || v.id::text);
  IF d.owner_id IS DISTINCT FROM d.created_by THEN
    PERFORM public.notify_user(d.owner_id, 'document.approved', 'Tài liệu đã được duyệt',
      d.display_name, 'document', d.id, '/documents/' || d.id::text,
      'doc-approved-owner-' || v.id::text);
  END IF;
  PERFORM public.write_audit(
    CASE WHEN _self THEN 'document.self_approved' ELSE 'document.approved' END,
    'document_version', v.id, jsonb_build_object('status','pending_approval'),
    jsonb_build_object('status', _next, 'approved_by', _actor, 'self_approved', _self,
                       'reason', CASE WHEN _self THEN btrim(_self_reason) ELSE NULL END), '{}'::jsonb);
  RETURN _next;
END; $$;

-- ============ Từ chối ============
CREATE OR REPLACE FUNCTION public.document_reject(_document uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v record; _actor uuid := auth.uid();
BEGIN
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Từ chối bắt buộc nhập lý do.'; END IF;
  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;
  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF v.status <> 'pending_approval' THEN RAISE EXCEPTION 'Tài liệu không ở trạng thái chờ duyệt.'; END IF;
  IF v.approved_at IS NOT NULL OR v.rejected_at IS NOT NULL THEN
    RAISE EXCEPTION 'Yêu cầu duyệt đã được xử lý.';
  END IF;
  IF _actor IS DISTINCT FROM v.approver_id AND _actor IS DISTINCT FROM v.alt_approver_id THEN
    RAISE EXCEPTION 'Bạn không phải người duyệt của tài liệu này.';
  END IF;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET status = 'draft', rejected_by = _actor, rejected_at = now(),
         reject_reason = btrim(_reason), approver_id = NULL, alt_approver_id = NULL
   WHERE id = v.id;
  PERFORM set_config('cen.doc_workflow','', true);

  PERFORM public.notify_user(d.created_by, 'document.rejected', 'Tài liệu bị từ chối',
    d.display_name || E'\n' || btrim(_reason), 'document', d.id, '/documents/' || d.id::text,
    'doc-rejected-' || v.id::text || '-' || extract(epoch from now())::bigint::text);
  IF d.owner_id IS DISTINCT FROM d.created_by THEN
    PERFORM public.notify_user(d.owner_id, 'document.rejected', 'Tài liệu bị từ chối',
      d.display_name || E'\n' || btrim(_reason), 'document', d.id, '/documents/' || d.id::text,
      'doc-rejected-owner-' || v.id::text || '-' || extract(epoch from now())::bigint::text);
  END IF;
  PERFORM public.write_audit('document.rejected','document_version', v.id,
    jsonb_build_object('status','pending_approval'),
    jsonb_build_object('status','draft','rejected_by',_actor,'reason', btrim(_reason)), '{}'::jsonb);
END; $$;

-- ============ Chỉ định người duyệt thay thế ============
CREATE OR REPLACE FUNCTION public.document_set_approver(_document uuid, _approver uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v record; _actor uuid := auth.uid();
BEGIN
  IF NOT public.is_system_admin(_actor) THEN
    RAISE EXCEPTION 'Chỉ CMO hoặc Admin được chỉ định người duyệt thay thế.';
  END IF;
  SELECT * INTO d FROM public.documents WHERE id = _document AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tài liệu.'; END IF;
  SELECT * INTO v FROM public.document_versions
   WHERE document_id = _document ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF v.status <> 'pending_approval' THEN RAISE EXCEPTION 'Tài liệu không ở trạng thái chờ duyệt.'; END IF;
  IF NOT public.is_active_account(_approver) THEN
    RAISE EXCEPTION 'Người duyệt thay thế phải là tài khoản đang hoạt động.';
  END IF;
  IF _approver = v.submitted_by OR _approver = d.created_by THEN
    RAISE EXCEPTION 'Người duyệt thay thế không được là người tạo hoặc người gửi duyệt.';
  END IF;

  PERFORM set_config('cen.doc_workflow','on', true);
  UPDATE public.document_versions
     SET alt_approver_id = _approver, approver_assigned_by = _actor, approver_assigned_at = now()
   WHERE id = v.id;
  PERFORM set_config('cen.doc_workflow','', true);

  PERFORM public.notify_user(_approver, 'document.approver_assigned', 'Bạn được chỉ định duyệt tài liệu',
    d.display_name, 'document', d.id, '/documents/' || d.id::text,
    'doc-approver-' || v.id::text || '-' || _approver::text);
  PERFORM public.write_audit('document.approver_changed','document_version', v.id,
    jsonb_build_object('alt_approver_id', v.alt_approver_id),
    jsonb_build_object('alt_approver_id', _approver), '{}'::jsonb);
END; $$;

-- ============ Quyền gọi hàm ============
REVOKE EXECUTE ON FUNCTION public.document_pick_admin(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.document_resolve_approver(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.document_submit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.document_withdraw(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.document_approve(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.document_reject(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.document_set_approver(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.document_resolve_approver(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_submit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_withdraw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_approve(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_reject(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_set_approver(uuid, uuid) TO authenticated;