
-- ============ ENUMS ============
CREATE TYPE public.document_scope AS ENUM ('system','team','project');
CREATE TYPE public.document_type AS ENUM ('regulation','process','guide','form','plan','report','training','reference','other');
CREATE TYPE public.document_source AS ENUM ('google_docs','google_sheets','google_slides','google_drive','canva','notion','website','other');
CREATE TYPE public.document_version_status AS ENUM ('draft','pending_approval','scheduled','active','expired','archived');

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.doc_normalize_name(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(regexp_replace(btrim(coalesce(_name,'')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.doc_type_label(_t public.document_type)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _t
    WHEN 'regulation' THEN 'Quy định'
    WHEN 'process' THEN 'Quy trình'
    WHEN 'guide' THEN 'Hướng dẫn'
    WHEN 'form' THEN 'Mẫu biểu'
    WHEN 'plan' THEN 'Kế hoạch'
    WHEN 'report' THEN 'Báo cáo'
    WHEN 'training' THEN 'Tài liệu đào tạo'
    WHEN 'reference' THEN 'Tài liệu tham khảo'
    ELSE 'Khác' END;
$$;

-- ============ DOCUMENTS ============
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  doc_type public.document_type NOT NULL,
  scope public.document_scope NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  description text,
  source_type public.document_source NOT NULL,
  source_url text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  latest_version_id uuid,
  active_version_id uuid,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_scope_shape CHECK (
    (scope = 'system' AND team_id IS NULL AND project_id IS NULL)
    OR (scope = 'team' AND team_id IS NOT NULL AND project_id IS NULL)
    OR (scope = 'project' AND project_id IS NOT NULL)
  ),
  CONSTRAINT documents_url_valid CHECK (source_url ~* '^https?://[^\s]+$'),
  CONSTRAINT documents_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX documents_unique_system
  ON public.documents (doc_type, normalized_name)
  WHERE scope = 'system' AND deleted_at IS NULL;
CREATE UNIQUE INDEX documents_unique_team
  ON public.documents (doc_type, team_id, normalized_name)
  WHERE scope = 'team' AND deleted_at IS NULL;
CREATE UNIQUE INDEX documents_unique_project
  ON public.documents (doc_type, project_id, normalized_name)
  WHERE scope = 'project' AND deleted_at IS NULL;
CREATE INDEX documents_scope_idx ON public.documents (scope, team_id, project_id);
CREATE INDEX documents_owner_idx ON public.documents (owner_id);

-- ============ DOCUMENT VERSIONS ============
CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  version_label text GENERATED ALWAYS AS ('v' || version_no::text) STORED,
  status public.document_version_status NOT NULL DEFAULT 'draft',
  source_type public.document_source NOT NULL,
  source_url text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  change_note text,
  needs_link_review boolean NOT NULL DEFAULT false,
  link_review_note text,
  link_reported_by uuid REFERENCES public.profiles(id),
  link_reported_at timestamptz,
  supersedes_version_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL,
  superseded_by_version_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_by uuid REFERENCES public.profiles(id),
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  rejected_by uuid REFERENCES public.profiles(id),
  rejected_at timestamptz,
  reject_reason text,
  self_approved boolean NOT NULL DEFAULT false,
  self_approval_reason text,
  ever_submitted boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by uuid REFERENCES public.profiles(id),
  restored_at timestamptz,
  restored_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_versions_no_positive CHECK (version_no >= 1),
  CONSTRAINT document_versions_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT document_versions_url_valid CHECK (source_url ~* '^https?://[^\s]+$'),
  CONSTRAINT document_versions_unique_no UNIQUE (document_id, version_no)
);
CREATE INDEX document_versions_doc_idx ON public.document_versions (document_id, version_no DESC);
CREATE INDEX document_versions_status_idx ON public.document_versions (status);

ALTER TABLE public.documents
  ADD CONSTRAINT documents_latest_version_fk FOREIGN KEY (latest_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL,
  ADD CONSTRAINT documents_active_version_fk FOREIGN KEY (active_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL;

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;

-- ============ SCOPE / PERMISSION FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_active_account(_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user AND p.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.can_create_document(_scope public.document_scope, _team uuid, _project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_system_admin(auth.uid()) THEN true
    WHEN _scope = 'system' THEN false
    WHEN _scope = 'team' THEN _team IN (SELECT public.my_team_ids())
    WHEN _scope = 'project' THEN public.is_in_project_scope(_project, auth.uid())
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_document(_document uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = _document
      AND (
        public.is_system_admin(auth.uid())
        OR d.created_by = auth.uid()
        OR d.owner_id = auth.uid()
        OR (d.scope = 'team' AND d.team_id IS NOT NULL AND d.team_id = public.leader_team_id(auth.uid()))
        OR (d.scope = 'project' AND d.project_id IS NOT NULL AND public.can_manage_project(d.project_id))
        OR (d.scope = 'project' AND d.project_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.project_teams pt
              WHERE pt.project_id = d.project_id AND pt.team_id = public.leader_team_id(auth.uid())))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.document_is_published(_document uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.document_versions v
    WHERE v.document_id = _document
      AND v.status IN ('scheduled','active','expired','archived')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_document(_document uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_account(auth.uid())
     AND (public.document_is_published(_document) OR public.can_manage_document(_document));
$$;

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.enforce_document_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_ok boolean;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.normalized_name := public.doc_normalize_name(NEW.name);
  IF NEW.normalized_name = '' THEN
    RAISE EXCEPTION 'Tên nội dung không được để trống.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.owner_id AND p.status = 'active')
    INTO v_owner_ok;
  IF NOT v_owner_ok THEN
    RAISE EXCEPTION 'Người phụ trách phải là tài khoản đang hoạt động.';
  END IF;

  NEW.display_name := public.doc_type_label(NEW.doc_type) || ' | ' || (
    CASE NEW.scope
      WHEN 'system' THEN 'Toàn hệ thống'
      WHEN 'team' THEN coalesce((SELECT t.name FROM public.teams t WHERE t.id = NEW.team_id), 'Team')
      ELSE coalesce((SELECT p.name FROM public.projects p WHERE p.id = NEW.project_id), 'Dự án')
    END) || ' | ' || NEW.name;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(auth.uid(), NEW.created_by);
    IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
      NEW.code := 'DOC-' || to_char(now(), 'YYMM') || '-' || upper(substr(replace(NEW.id::text,'-',''), 1, 6));
    END IF;
  ELSE
    NEW.code := OLD.code;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER documents_enforce
BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_document_row();

CREATE OR REPLACE FUNCTION public.create_first_document_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.document_versions (document_id, version_no, status, source_type, source_url,
    effective_from, created_by)
  VALUES (NEW.id, 1, 'draft', NEW.source_type, NEW.source_url, current_date, NEW.created_by)
  RETURNING id INTO v_id;
  UPDATE public.documents SET latest_version_id = v_id WHERE id = NEW.id;
  RETURN NEW;
END; $$;

CREATE TRIGGER documents_create_v1
AFTER INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.create_first_document_version();

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
  ELSE
    NEW.version_no := OLD.version_no;
    NEW.document_id := OLD.document_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
    IF NEW.status <> 'draft' OR OLD.ever_submitted THEN
      NEW.ever_submitted := true;
    END IF;
    IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.submitted_by AND NOT NEW.self_approved THEN
      RAISE EXCEPTION 'Không được tự duyệt phiên bản do chính mình gửi duyệt.';
    END IF;
    IF NEW.self_approved AND coalesce(btrim(NEW.self_approval_reason),'') = '' THEN
      RAISE EXCEPTION 'Ngoại lệ tự duyệt phải có lý do.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER document_versions_enforce
BEFORE INSERT OR UPDATE ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION public.enforce_document_version_row();

CREATE OR REPLACE FUNCTION public.sync_document_version_pointers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.documents d
     SET latest_version_id = (SELECT v.id FROM public.document_versions v
                              WHERE v.document_id = d.id ORDER BY v.version_no DESC LIMIT 1),
         active_version_id = (SELECT v.id FROM public.document_versions v
                              WHERE v.document_id = d.id AND v.status = 'active'
                              ORDER BY v.version_no DESC LIMIT 1),
         updated_at = now()
   WHERE d.id = NEW.document_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER document_versions_sync
AFTER INSERT OR UPDATE ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION public.sync_document_version_pointers();

CREATE OR REPLACE FUNCTION public.block_submitted_document_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'document_versions' THEN
    IF OLD.ever_submitted OR OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Không được xóa phiên bản đã từng gửi duyệt. Hãy lưu trữ thay vì xóa.';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.document_versions v
               WHERE v.document_id = OLD.id AND (v.ever_submitted OR v.status <> 'draft')) THEN
      RAISE EXCEPTION 'Không được xóa tài liệu đã từng gửi duyệt. Hãy lưu trữ thay vì xóa.';
    END IF;
  END IF;
  RETURN OLD;
END; $$;

CREATE TRIGGER documents_block_hard_delete
BEFORE DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.block_submitted_document_delete();

CREATE TRIGGER document_versions_block_hard_delete
BEFORE DELETE ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION public.block_submitted_document_delete();

-- ============ AUDIT ============
CREATE OR REPLACE FUNCTION public.audit_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('document.created','document', NEW.id, NULL,
      jsonb_build_object('name', NEW.name, 'doc_type', NEW.doc_type, 'scope', NEW.scope,
        'team_id', NEW.team_id, 'project_id', NEW.project_id, 'owner_id', NEW.owner_id), '{}'::jsonb);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.write_audit('document.deleted','document', OLD.id,
      jsonb_build_object('name', OLD.name), NULL, '{}'::jsonb);
    RETURN OLD;
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.doc_type IS DISTINCT FROM OLD.doc_type
     OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.source_url IS DISTINCT FROM OLD.source_url THEN
    PERFORM public.write_audit('document.updated','document', NEW.id,
      jsonb_build_object('name', OLD.name, 'owner_id', OLD.owner_id, 'source_url', OLD.source_url),
      jsonb_build_object('name', NEW.name, 'owner_id', NEW.owner_id, 'source_url', NEW.source_url), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER documents_audit
AFTER INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.audit_document();

CREATE OR REPLACE FUNCTION public.audit_document_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('document_version.created','document_version', NEW.id, NULL,
      jsonb_build_object('document_id', NEW.document_id, 'version_no', NEW.version_no), '{}'::jsonb);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit('document_version.status_changed','document_version', NEW.id,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status), '{}'::jsonb);
  END IF;
  IF NEW.needs_link_review IS DISTINCT FROM OLD.needs_link_review THEN
    PERFORM public.write_audit('document_version.link_review','document_version', NEW.id,
      jsonb_build_object('needs_link_review', OLD.needs_link_review),
      jsonb_build_object('needs_link_review', NEW.needs_link_review), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER document_versions_audit
AFTER INSERT OR UPDATE ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION public.audit_document_version();

-- ============ RLS ============
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated
USING (deleted_at IS NULL AND public.can_view_document(id));

CREATE POLICY "documents_insert" ON public.documents FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.can_create_document(scope, team_id, project_id));

CREATE POLICY "documents_update" ON public.documents FOR UPDATE TO authenticated
USING (public.can_manage_document(id)) WITH CHECK (public.can_manage_document(id));

CREATE POLICY "documents_delete" ON public.documents FOR DELETE TO authenticated
USING (public.can_manage_document(id));

CREATE POLICY "document_versions_select" ON public.document_versions FOR SELECT TO authenticated
USING (
  public.is_active_account(auth.uid())
  AND (status IN ('scheduled','active','expired','archived') OR public.can_manage_document(document_id))
);

CREATE POLICY "document_versions_insert" ON public.document_versions FOR INSERT TO authenticated
WITH CHECK (public.can_manage_document(document_id));

CREATE POLICY "document_versions_update" ON public.document_versions FOR UPDATE TO authenticated
USING (public.can_manage_document(document_id)) WITH CHECK (public.can_manage_document(document_id));

CREATE POLICY "document_versions_delete" ON public.document_versions FOR DELETE TO authenticated
USING (public.can_manage_document(document_id) AND status = 'draft' AND NOT ever_submitted);

-- ============ EXECUTE GRANTS ============
REVOKE EXECUTE ON FUNCTION public.doc_normalize_name(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.doc_type_label(public.document_type) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_create_document(public.document_scope, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_document(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.document_is_published(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_active_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_document(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_document_row() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_first_document_version() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_document_version_row() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_document_version_pointers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_submitted_document_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_document() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_document_version() FROM PUBLIC, anon, authenticated;
