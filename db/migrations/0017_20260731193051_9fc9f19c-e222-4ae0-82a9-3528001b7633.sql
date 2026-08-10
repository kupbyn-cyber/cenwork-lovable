
CREATE TYPE public.project_status AS ENUM (
  'idea','leader_review','proposal','planning','in_progress','pending_acceptance','completed','archived'
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  objective text NOT NULL,
  description text,
  owner_id uuid REFERENCES public.profiles(id),
  start_date date,
  deadline date,
  status public.project_status NOT NULL DEFAULT 'idea',
  last_decision_note text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, team_id)
);

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE TABLE public.project_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, facility_id)
);

CREATE INDEX idx_projects_status ON public.projects(status);
CREATE INDEX idx_projects_owner ON public.projects(owner_id);
CREATE INDEX idx_project_teams_team ON public.project_teams(team_id);
CREATE INDEX idx_project_members_user ON public.project_members(user_id);

GRANT SELECT, INSERT, UPDATE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT SELECT, INSERT, DELETE ON public.project_teams TO authenticated;
GRANT ALL ON public.project_teams TO service_role;
GRANT SELECT, INSERT, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
GRANT SELECT, INSERT, DELETE ON public.project_facilities TO authenticated;
GRANT ALL ON public.project_facilities TO service_role;

-- ===== Helper functions =====
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_team_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.primary_team_id FROM public.profiles p WHERE p.id = auth.uid() AND p.primary_team_id IS NOT NULL
  UNION
  SELECT tc.team_id FROM public.team_collaborators tc WHERE tc.user_id = auth.uid()
  UNION
  SELECT t.id FROM public.teams t WHERE t.leader_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_view_project(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND (p.created_by = auth.uid() OR p.owner_id = auth.uid()))
      OR EXISTS (SELECT 1 FROM public.project_members pm
                 WHERE pm.project_id = _project AND pm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.project_teams pt
                 WHERE pt.project_id = _project AND pt.team_id IN (SELECT public.my_team_ids()))
      OR EXISTS (SELECT 1 FROM public.projects p JOIN public.profiles c ON c.id = p.created_by
                 WHERE p.id = _project AND p.status = 'leader_review'
                   AND c.primary_team_id IS NOT NULL
                   AND c.primary_team_id = public.leader_team_id(auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_project(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project AND p.owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project_row(_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_project(_project)
      OR EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND p.created_by = auth.uid() AND p.status = 'idea')
      OR EXISTS (SELECT 1 FROM public.projects p JOIN public.profiles c ON c.id = p.created_by
                 WHERE p.id = _project AND p.status = 'leader_review'
                   AND c.primary_team_id IS NOT NULL
                   AND c.primary_team_id = public.leader_team_id(auth.uid()));
$$;

-- ===== RLS =====
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_scoped ON public.projects
  FOR SELECT TO authenticated USING (public.can_view_project(id));
CREATE POLICY projects_insert_idea ON public.projects
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND status = 'idea');
CREATE POLICY projects_update_scoped ON public.projects
  FOR UPDATE TO authenticated
  USING (public.can_edit_project_row(id)) WITH CHECK (public.can_edit_project_row(id));

CREATE POLICY project_teams_select ON public.project_teams
  FOR SELECT TO authenticated USING (public.can_view_project(project_id));
CREATE POLICY project_teams_write ON public.project_teams
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project_row(project_id));
CREATE POLICY project_teams_delete ON public.project_teams
  FOR DELETE TO authenticated USING (public.can_edit_project_row(project_id));

CREATE POLICY project_members_select ON public.project_members
  FOR SELECT TO authenticated USING (public.can_view_project(project_id));
CREATE POLICY project_members_write ON public.project_members
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project_row(project_id));
CREATE POLICY project_members_delete ON public.project_members
  FOR DELETE TO authenticated USING (public.can_edit_project_row(project_id));

CREATE POLICY project_facilities_select ON public.project_facilities
  FOR SELECT TO authenticated USING (public.can_view_project(project_id));
CREATE POLICY project_facilities_write ON public.project_facilities
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_project_row(project_id));
CREATE POLICY project_facilities_delete ON public.project_facilities
  FOR DELETE TO authenticated USING (public.can_edit_project_row(project_id));

-- lịch sử dự án hiển thị cho người xem được dự án
CREATE POLICY audit_logs_select_project ON public.audit_logs
  FOR SELECT TO authenticated
  USING (entity_type = 'project' AND entity_id IS NOT NULL AND public.can_view_project(entity_id));

-- ===== Business rules =====
CREATE OR REPLACE FUNCTION public.validate_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role := public.current_app_role();
  _is_admin boolean := public.has_role(auth.uid(),'admin');
  _is_cmo boolean := public.has_role(auth.uid(),'cmo');
  _is_owner boolean := NEW.owner_id IS NOT NULL AND NEW.owner_id = auth.uid();
  _is_creator boolean := NEW.created_by = auth.uid();
  _is_reviewer boolean := FALSE;
  _team_count int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.deadline IS NOT NULL AND NEW.start_date IS NOT NULL AND NEW.deadline < NEW.start_date THEN
    RAISE EXCEPTION 'Deadline không được trước ngày bắt đầu';
  END IF;

  IF NEW.owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = NEW.owner_id AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Project Owner phải là nhân sự đang hoạt động';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles c
    WHERE c.id = NEW.created_by AND c.primary_team_id IS NOT NULL
      AND c.primary_team_id = public.leader_team_id(auth.uid())
  ) INTO _is_reviewer;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'idea' THEN RAISE EXCEPTION 'Dự án mới phải bắt đầu ở trạng thái Ý tưởng'; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Không được đổi định danh hoặc người tạo dự án';
  END IF;

  -- Thay đổi nội dung (không đổi trạng thái)
  IF NEW.status = OLD.status THEN
    IF OLD.status = 'idea' THEN
      IF NOT (_is_creator OR _is_admin) THEN RAISE EXCEPTION 'Chỉ người gửi ý tưởng được chỉnh sửa'; END IF;
    ELSIF OLD.status IN ('leader_review','proposal') THEN
      IF NOT (_is_admin OR _is_cmo) THEN RAISE EXCEPTION 'Nội dung đang chờ duyệt, không thể chỉnh sửa'; END IF;
    ELSIF OLD.status = 'archived' THEN
      IF NOT _is_admin THEN RAISE EXCEPTION 'Dự án đã lưu trữ, không thể chỉnh sửa'; END IF;
    ELSE
      IF NOT (_is_admin OR _is_cmo OR OLD.owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Chỉ CMO hoặc Project Owner được cập nhật dự án';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Chuyển trạng thái
  IF NEW.status = 'archived' THEN
    IF NOT (_is_admin OR _is_cmo OR OLD.owner_id = auth.uid()) THEN
      RAISE EXCEPTION 'Chỉ CMO, Admin hoặc Project Owner được lưu trữ dự án';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'idea' AND NEW.status = 'leader_review' THEN
    IF NOT (_is_creator OR _is_admin) THEN RAISE EXCEPTION 'Chỉ người gửi được gửi ý tưởng đi duyệt'; END IF;
  ELSIF OLD.status = 'leader_review' AND NEW.status = 'proposal' THEN
    IF NOT (_is_reviewer OR _is_admin) THEN RAISE EXCEPTION 'Chỉ Leader của Team chính người gửi được duyệt ý tưởng'; END IF;
  ELSIF OLD.status = 'leader_review' AND NEW.status = 'idea' THEN
    IF NOT (_is_reviewer OR _is_admin) THEN RAISE EXCEPTION 'Chỉ Leader của Team chính người gửi được từ chối ý tưởng'; END IF;
    IF COALESCE(btrim(NEW.last_decision_note),'') = '' THEN RAISE EXCEPTION 'Phải nhập lý do từ chối'; END IF;
  ELSIF OLD.status = 'proposal' AND NEW.status = 'planning' THEN
    IF NOT (_is_cmo OR _is_admin) THEN RAISE EXCEPTION 'Chỉ CMO được duyệt đề xuất thành dự án chính thức'; END IF;
    IF NEW.owner_id IS NULL THEN RAISE EXCEPTION 'Dự án chính thức phải có Project Owner'; END IF;
    SELECT count(*) INTO _team_count FROM public.project_teams pt WHERE pt.project_id = NEW.id;
    IF _team_count = 0 THEN RAISE EXCEPTION 'Dự án chính thức phải có ít nhất một Team tham gia'; END IF;
    IF NEW.start_date IS NULL OR NEW.deadline IS NULL THEN RAISE EXCEPTION 'Dự án chính thức phải có ngày bắt đầu và deadline'; END IF;
  ELSIF OLD.status = 'proposal' AND NEW.status = 'leader_review' THEN
    IF NOT (_is_cmo OR _is_admin) THEN RAISE EXCEPTION 'Chỉ CMO được từ chối đề xuất'; END IF;
    IF COALESCE(btrim(NEW.last_decision_note),'') = '' THEN RAISE EXCEPTION 'Phải nhập lý do từ chối'; END IF;
  ELSIF (OLD.status,NEW.status) IN (
      ('planning','in_progress'),('in_progress','pending_acceptance'),
      ('pending_acceptance','completed'),('pending_acceptance','in_progress')
  ) THEN
    IF NOT (_is_admin OR _is_cmo OR OLD.owner_id = auth.uid()) THEN
      RAISE EXCEPTION 'Chỉ CMO, Admin hoặc Project Owner được chuyển trạng thái dự án';
    END IF;
  ELSE
    RAISE EXCEPTION 'Không thể chuyển trạng thái từ % sang %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_projects_validate
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.validate_project();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_project_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'project_facilities' AND NOT EXISTS (
    SELECT 1 FROM public.facilities f WHERE f.id = NEW.facility_id AND f.is_active
  ) THEN RAISE EXCEPTION 'Cơ sở không còn hoạt động'; END IF;

  IF TG_TABLE_NAME = 'project_members' AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.status = 'active'
  ) THEN RAISE EXCEPTION 'Thành viên tham gia phải đang hoạt động'; END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_project_members_validate BEFORE INSERT ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_link();
CREATE TRIGGER trg_project_facilities_validate BEFORE INSERT ON public.project_facilities
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_link();

-- ===== Audit =====
CREATE OR REPLACE FUNCTION public.audit_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('project.created','project',NEW.id,NULL,
      jsonb_build_object('name',NEW.name,'status',NEW.status));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit(
      CASE
        WHEN OLD.status='idea' AND NEW.status='leader_review' THEN 'project.submitted'
        WHEN OLD.status='leader_review' AND NEW.status='proposal' THEN 'project.leader_approved'
        WHEN OLD.status='leader_review' AND NEW.status='idea' THEN 'project.leader_rejected'
        WHEN OLD.status='proposal' AND NEW.status='planning' THEN 'project.cmo_approved'
        WHEN OLD.status='proposal' AND NEW.status='leader_review' THEN 'project.cmo_rejected'
        WHEN NEW.status='archived' THEN 'project.archived'
        ELSE 'project.status_changed'
      END,
      'project', NEW.id,
      jsonb_build_object('status',OLD.status),
      jsonb_build_object('status',NEW.status,'note',NEW.last_decision_note));
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    PERFORM public.write_audit('project.owner_changed','project',NEW.id,
      jsonb_build_object('owner_id',OLD.owner_id), jsonb_build_object('owner_id',NEW.owner_id));
  END IF;

  IF NEW.deadline IS DISTINCT FROM OLD.deadline OR NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    PERFORM public.write_audit('project.schedule_changed','project',NEW.id,
      jsonb_build_object('start_date',OLD.start_date,'deadline',OLD.deadline),
      jsonb_build_object('start_date',NEW.start_date,'deadline',NEW.deadline));
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.objective IS DISTINCT FROM OLD.objective
     OR NEW.description IS DISTINCT FROM OLD.description THEN
    PERFORM public.write_audit('project.updated','project',NEW.id,
      jsonb_build_object('name',OLD.name), jsonb_build_object('name',NEW.name));
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_projects_audit AFTER INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_project();

CREATE OR REPLACE FUNCTION public.audit_project_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row record := COALESCE(NEW, OLD);
  _kind text := CASE TG_TABLE_NAME
    WHEN 'project_teams' THEN 'team' WHEN 'project_members' THEN 'member' ELSE 'facility' END;
  _ref uuid := CASE TG_TABLE_NAME
    WHEN 'project_teams' THEN (COALESCE(NEW,OLD)).team_id
    WHEN 'project_members' THEN (COALESCE(NEW,OLD)).user_id
    ELSE (COALESCE(NEW,OLD)).facility_id END;
BEGIN
  PERFORM public.write_audit(
    'project.' || _kind || CASE WHEN TG_OP='INSERT' THEN '_linked' ELSE '_unlinked' END,
    'project', _row.project_id, NULL, jsonb_build_object('ref_id', _ref));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_project_teams_audit AFTER INSERT OR DELETE ON public.project_teams
  FOR EACH ROW EXECUTE FUNCTION public.audit_project_link();
CREATE TRIGGER trg_project_members_audit AFTER INSERT OR DELETE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_project_link();
CREATE TRIGGER trg_project_facilities_audit AFTER INSERT OR DELETE ON public.project_facilities
  FOR EACH ROW EXECUTE FUNCTION public.audit_project_link();

REVOKE EXECUTE ON FUNCTION public.validate_project(), public.validate_project_link(),
  public.audit_project(), public.audit_project_link() FROM PUBLIC, anon, authenticated;
