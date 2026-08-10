
-- ===== ENUMS (riêng cho Phê duyệt) =====
CREATE TYPE public.approval_mode AS ENUM ('any_one', 'all_required');
CREATE TYPE public.approval_request_status AS ENUM ('pending', 'overdue', 'approved', 'rejected', 'withdrawn');
CREATE TYPE public.approval_decision_status AS ENUM ('pending', 'approved', 'rejected', 'replaced');

-- ===== TABLES =====
CREATE TABLE public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approval_mode public.approval_mode NOT NULL,
  status public.approval_request_status NOT NULL DEFAULT 'pending',
  due_at timestamptz NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  approved_at timestamptz,
  rejected_at timestamptz,
  withdrawn_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.approval_request_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  due_at timestamptz NOT NULL,
  approval_mode public.approval_mode NOT NULL,
  approver_ids uuid[] NOT NULL,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  outcome_status public.approval_request_status,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_request_id, version_no)
);

CREATE TABLE public.approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  approver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision_status public.approval_decision_status NOT NULL DEFAULT 'pending',
  decision_at timestamptz,
  approval_note text,
  rejection_reason text,
  replaced_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  replaced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_request_id, version_no, approver_id)
);

CREATE INDEX idx_approval_requests_sender ON public.approval_requests(sender_id);
CREATE INDEX idx_approval_requests_status ON public.approval_requests(status);
CREATE INDEX idx_approval_decisions_approver ON public.approval_decisions(approver_id, decision_status);
CREATE INDEX idx_approval_decisions_request ON public.approval_decisions(approval_request_id, version_no);

-- ===== GRANTS =====
GRANT SELECT ON public.approval_requests TO authenticated;
GRANT SELECT ON public.approval_request_versions TO authenticated;
GRANT SELECT ON public.approval_decisions TO authenticated;
GRANT ALL ON public.approval_requests TO service_role;
GRANT ALL ON public.approval_request_versions TO service_role;
GRANT ALL ON public.approval_decisions TO service_role;

-- ===== updated_at =====
CREATE TRIGGER trg_approval_requests_updated_at
BEFORE UPDATE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_approval_decisions_updated_at
BEFORE UPDATE ON public.approval_decisions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== HELPERS =====
CREATE OR REPLACE FUNCTION public.approval_can_view(_request uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.approval_is_current_approver(_request uuid, _user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approval_requests r
    JOIN public.approval_decisions d
      ON d.approval_request_id = r.id AND d.version_no = r.current_version
    WHERE r.id = _request
      AND d.approver_id = _user
      AND d.decision_status = 'pending'
      AND r.status IN ('pending', 'overdue')
  );
$$;

-- Tính kết quả cuối cho phiên bản hiện tại (gọi bên trong transaction đã khóa request).
CREATE OR REPLACE FUNCTION public.approval_finalize(_request uuid)
RETURNS public.approval_request_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.approval_requests%ROWTYPE;
  _total int; _approved int; _rejected int; _pending int;
  _outcome public.approval_request_status;
  _before jsonb;
BEGIN
  SELECT * INTO r FROM public.approval_requests WHERE id = _request;
  IF r.status NOT IN ('pending', 'overdue') THEN RETURN r.status; END IF;

  SELECT count(*) FILTER (WHERE decision_status <> 'replaced'),
         count(*) FILTER (WHERE decision_status = 'approved'),
         count(*) FILTER (WHERE decision_status = 'rejected'),
         count(*) FILTER (WHERE decision_status = 'pending')
    INTO _total, _approved, _rejected, _pending
  FROM public.approval_decisions
  WHERE approval_request_id = _request AND version_no = r.current_version;

  IF r.approval_mode = 'any_one' THEN
    IF _approved > 0 THEN _outcome := 'approved';
    ELSIF _pending = 0 AND _rejected = _total AND _total > 0 THEN _outcome := 'rejected';
    END IF;
  ELSE
    IF _rejected > 0 THEN _outcome := 'rejected';
    ELSIF _pending = 0 AND _approved = _total AND _total > 0 THEN _outcome := 'approved';
    END IF;
  END IF;

  IF _outcome IS NULL THEN RETURN r.status; END IF;

  _before := to_jsonb(r);
  UPDATE public.approval_requests
     SET status = _outcome,
         approved_at = CASE WHEN _outcome = 'approved' THEN now() ELSE approved_at END,
         rejected_at = CASE WHEN _outcome = 'rejected' THEN now() ELSE rejected_at END
   WHERE id = _request
   RETURNING * INTO r;

  UPDATE public.approval_request_versions
     SET outcome_status = _outcome, ended_at = now()
   WHERE approval_request_id = _request AND version_no = r.current_version;

  PERFORM public.write_audit(
    'approval.finalized', 'approval_request', _request, _before, to_jsonb(r),
    jsonb_build_object('version_no', r.current_version, 'outcome', _outcome)
  );
  RETURN _outcome;
END; $$;

-- ===== TẠO YÊU CẦU =====
CREATE OR REPLACE FUNCTION public.approval_create(
  _title text, _content text, _due_at timestamptz,
  _mode public.approval_mode, _approvers uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _ids uuid[];
  _request uuid;
BEGIN
  IF _me IS NULL OR NOT public.is_active_account(_me) THEN
    RAISE EXCEPTION 'Tài khoản không hoạt động, không thể tạo yêu cầu phê duyệt';
  END IF;
  IF coalesce(btrim(_title), '') = '' THEN
    RAISE EXCEPTION 'Tiêu đề không được để trống';
  END IF;
  IF _due_at IS NULL OR _due_at <= now() THEN
    RAISE EXCEPTION 'Hạn xử lý phải ở tương lai';
  END IF;

  SELECT array_agg(DISTINCT p.id) INTO _ids
  FROM public.profiles p
  WHERE p.id = ANY(coalesce(_approvers, '{}'::uuid[]))
    AND p.status = 'active'
    AND p.id <> _me;

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Phải chọn ít nhất một người phê duyệt đang hoạt động (không gồm chính bạn)';
  END IF;
  IF array_length(_ids, 1) <> array_length(ARRAY(SELECT DISTINCT unnest(coalesce(_approvers, '{}'::uuid[]))), 1) THEN
    RAISE EXCEPTION 'Danh sách người phê duyệt có tài khoản không hợp lệ';
  END IF;

  INSERT INTO public.approval_requests (title, content, sender_id, approval_mode, due_at)
  VALUES (btrim(_title), coalesce(_content, ''), _me, _mode, _due_at)
  RETURNING id INTO _request;

  INSERT INTO public.approval_request_versions
    (approval_request_id, version_no, title, content, due_at, approval_mode, approver_ids, submitted_by)
  VALUES (_request, 1, btrim(_title), coalesce(_content, ''), _due_at, _mode, _ids, _me);

  INSERT INTO public.approval_decisions (approval_request_id, version_no, approver_id)
  SELECT _request, 1, u FROM unnest(_ids) AS u;

  PERFORM public.write_audit(
    'approval.created', 'approval_request', _request, NULL,
    to_jsonb((SELECT r FROM public.approval_requests r WHERE r.id = _request)),
    jsonb_build_object('version_no', 1, 'approvers', _ids)
  );
  RETURN _request;
END; $$;

-- ===== PHÊ DUYỆT / TỪ CHỐI =====
CREATE OR REPLACE FUNCTION public.approval_decide(_request uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS public.approval_request_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  r public.approval_requests%ROWTYPE;
  d public.approval_decisions%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.approval_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu phê duyệt'; END IF;
  IF r.status NOT IN ('pending', 'overdue') THEN
    RAISE EXCEPTION 'Yêu cầu đã kết thúc, không thể xử lý thêm';
  END IF;
  IF NOT public.is_active_account(_me) THEN
    RAISE EXCEPTION 'Tài khoản không hoạt động';
  END IF;

  SELECT * INTO d FROM public.approval_decisions
   WHERE approval_request_id = _request AND version_no = r.current_version AND approver_id = _me
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bạn không nằm trong danh sách người phê duyệt của phiên bản hiện tại'; END IF;
  IF d.decision_status <> 'pending' THEN RAISE EXCEPTION 'Quyết định đã gửi, không thể thay đổi'; END IF;
  IF NOT _approve AND coalesce(btrim(_note), '') = '' THEN
    RAISE EXCEPTION 'Từ chối bắt buộc phải có lý do';
  END IF;

  UPDATE public.approval_decisions
     SET decision_status = CASE WHEN _approve THEN 'approved'::public.approval_decision_status ELSE 'rejected'::public.approval_decision_status END,
         decision_at = now(),
         approval_note = CASE WHEN _approve THEN nullif(btrim(coalesce(_note, '')), '') ELSE approval_note END,
         rejection_reason = CASE WHEN _approve THEN rejection_reason ELSE btrim(_note) END
   WHERE id = d.id;

  PERFORM public.write_audit(
    CASE WHEN _approve THEN 'approval.approved' ELSE 'approval.rejected' END,
    'approval_request', _request, to_jsonb(d),
    to_jsonb((SELECT x FROM public.approval_decisions x WHERE x.id = d.id)),
    jsonb_build_object('version_no', r.current_version, 'status_before', r.status)
  );

  RETURN public.approval_finalize(_request);
END; $$;

-- ===== THU HỒI =====
CREATE OR REPLACE FUNCTION public.approval_withdraw(_request uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.approval_requests%ROWTYPE;
  _before jsonb;
BEGIN
  SELECT * INTO r FROM public.approval_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu phê duyệt'; END IF;
  IF r.sender_id <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được thu hồi yêu cầu'; END IF;
  IF r.status NOT IN ('pending', 'overdue') THEN RAISE EXCEPTION 'Yêu cầu đã có kết quả cuối, không thể thu hồi'; END IF;

  _before := to_jsonb(r);
  UPDATE public.approval_requests SET status = 'withdrawn', withdrawn_at = now() WHERE id = _request RETURNING * INTO r;
  UPDATE public.approval_request_versions
     SET outcome_status = 'withdrawn', ended_at = now()
   WHERE approval_request_id = _request AND version_no = r.current_version;

  PERFORM public.write_audit('approval.withdrawn', 'approval_request', _request, _before, to_jsonb(r),
    jsonb_build_object('version_no', r.current_version, 'reason', nullif(btrim(coalesce(_reason, '')), '')));
END; $$;

-- ===== GỬI LẠI (chỉ khi bị từ chối) =====
CREATE OR REPLACE FUNCTION public.approval_resubmit(_request uuid, _title text, _content text, _due_at timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.approval_requests%ROWTYPE;
  _before jsonb;
  _next int;
  _ids uuid[];
BEGIN
  SELECT * INTO r FROM public.approval_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu phê duyệt'; END IF;
  IF r.sender_id <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được gửi lại yêu cầu'; END IF;
  IF r.status <> 'rejected' THEN RAISE EXCEPTION 'Chỉ yêu cầu bị từ chối mới được sửa và gửi lại'; END IF;
  IF NOT public.is_active_account(auth.uid()) THEN RAISE EXCEPTION 'Tài khoản không hoạt động'; END IF;
  IF coalesce(btrim(_title), '') = '' THEN RAISE EXCEPTION 'Tiêu đề không được để trống'; END IF;
  IF _due_at IS NULL OR _due_at <= now() THEN RAISE EXCEPTION 'Hạn xử lý phải ở tương lai'; END IF;

  SELECT approver_ids INTO _ids FROM public.approval_request_versions
   WHERE approval_request_id = _request AND version_no = r.current_version;

  _next := r.current_version + 1;
  _before := to_jsonb(r);

  INSERT INTO public.approval_request_versions
    (approval_request_id, version_no, title, content, due_at, approval_mode, approver_ids, submitted_by)
  VALUES (_request, _next, btrim(_title), coalesce(_content, ''), _due_at, r.approval_mode, _ids, auth.uid());

  INSERT INTO public.approval_decisions (approval_request_id, version_no, approver_id)
  SELECT _request, _next, u FROM unnest(_ids) AS u;

  UPDATE public.approval_requests
     SET title = btrim(_title), content = coalesce(_content, ''), due_at = _due_at,
         current_version = _next, status = 'pending', rejected_at = NULL
   WHERE id = _request RETURNING * INTO r;

  PERFORM public.write_audit('approval.resubmitted', 'approval_request', _request, _before, to_jsonb(r),
    jsonb_build_object('version_no', _next, 'approvers', _ids));
  RETURN _next;
END; $$;

-- ===== ĐÁNH DẤU QUÁ HẠN =====
CREATE OR REPLACE FUNCTION public.approval_mark_overdue()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count int := 0; _row public.approval_requests%ROWTYPE;
BEGIN
  FOR _row IN
    SELECT * FROM public.approval_requests
     WHERE status = 'pending' AND due_at < now() FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.approval_requests SET status = 'overdue' WHERE id = _row.id;
    PERFORM public.write_audit('approval.overdue', 'approval_request', _row.id,
      to_jsonb(_row), jsonb_build_object('status', 'overdue'),
      jsonb_build_object('version_no', _row.current_version));
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END; $$;

-- ===== THAY NGƯỜI PHÊ DUYỆT BỊ KHÓA =====
CREATE OR REPLACE FUNCTION public.approval_replace_approver(_request uuid, _old uuid, _new uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.approval_requests%ROWTYPE;
  d public.approval_decisions%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.approval_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy yêu cầu phê duyệt'; END IF;
  IF r.sender_id <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được thay người phê duyệt'; END IF;
  IF r.status NOT IN ('pending', 'overdue') THEN RAISE EXCEPTION 'Yêu cầu đã kết thúc'; END IF;
  IF _new = r.sender_id THEN RAISE EXCEPTION 'Không thể chọn chính người gửi làm người phê duyệt'; END IF;
  IF public.is_active_account(_old) THEN RAISE EXCEPTION 'Chỉ thay được người phê duyệt đã ngừng hoạt động'; END IF;
  IF NOT public.is_active_account(_new) THEN RAISE EXCEPTION 'Người thay thế phải là tài khoản đang hoạt động'; END IF;
  IF EXISTS (SELECT 1 FROM public.approval_decisions x
              WHERE x.approval_request_id = _request AND x.version_no = r.current_version
                AND x.approver_id = _new AND x.decision_status <> 'replaced') THEN
    RAISE EXCEPTION 'Người thay thế đã có trong danh sách phê duyệt';
  END IF;

  SELECT * INTO d FROM public.approval_decisions
   WHERE approval_request_id = _request AND version_no = r.current_version AND approver_id = _old
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Người phê duyệt không thuộc phiên bản hiện tại'; END IF;
  IF d.decision_status <> 'pending' THEN RAISE EXCEPTION 'Chỉ thay được người chưa xử lý'; END IF;

  UPDATE public.approval_decisions
     SET decision_status = 'replaced', replaced_by = _new, replaced_at = now()
   WHERE id = d.id;

  INSERT INTO public.approval_decisions (approval_request_id, version_no, approver_id)
  VALUES (_request, r.current_version, _new)
  ON CONFLICT (approval_request_id, version_no, approver_id)
  DO UPDATE SET decision_status = 'pending', decision_at = NULL, replaced_by = NULL, replaced_at = NULL;

  UPDATE public.approval_request_versions
     SET approver_ids = array_replace(approver_ids, _old, _new)
   WHERE approval_request_id = _request AND version_no = r.current_version;

  PERFORM public.write_audit('approval.approver_replaced', 'approval_request', _request,
    to_jsonb(d), jsonb_build_object('approver_id', _new),
    jsonb_build_object('version_no', r.current_version, 'old_approver', _old, 'new_approver', _new));

  PERFORM public.approval_finalize(_request);
END; $$;

-- ===== RLS =====
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_request_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_requests_select" ON public.approval_requests
FOR SELECT TO authenticated USING (public.approval_can_view(id));

CREATE POLICY "approval_versions_select" ON public.approval_request_versions
FOR SELECT TO authenticated USING (public.approval_can_view(approval_request_id));

CREATE POLICY "approval_decisions_select" ON public.approval_decisions
FOR SELECT TO authenticated USING (public.approval_can_view(approval_request_id));

-- Không có policy INSERT/UPDATE/DELETE: mọi thay đổi phải qua function đã kiểm tra quyền.

-- ===== EXECUTE GRANTS =====
REVOKE ALL ON FUNCTION public.approval_can_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_is_current_approver(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_finalize(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_create(text, text, timestamptz, public.approval_mode, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_decide(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_withdraw(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_resubmit(uuid, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approval_mark_overdue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_replace_approver(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approval_can_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_is_current_approver(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_create(text, text, timestamptz, public.approval_mode, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_decide(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_withdraw(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_resubmit(uuid, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_replace_approver(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_finalize(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approval_mark_overdue() TO service_role;
