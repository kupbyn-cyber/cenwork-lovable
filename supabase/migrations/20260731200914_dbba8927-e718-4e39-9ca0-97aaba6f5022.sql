-- ============ Enum ============
DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM ('draft','submitted','changes_requested','approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ Bảng báo cáo ngày ============
CREATE TABLE public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  team_id uuid REFERENCES public.teams(id),
  results text,
  blockers text,
  next_plan text,
  status public.report_status NOT NULL DEFAULT 'draft',
  reviewer_id uuid REFERENCES public.profiles(id),
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_reports_unique_author_date UNIQUE (author_id, report_date)
);
CREATE INDEX daily_reports_date_idx ON public.daily_reports (report_date DESC);
CREATE INDEX daily_reports_team_idx ON public.daily_reports (team_id);

GRANT SELECT, INSERT, UPDATE ON public.daily_reports TO authenticated;
GRANT ALL ON public.daily_reports TO service_role;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- ============ Bảng báo cáo tuần ============
CREATE TABLE public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  week_start date NOT NULL,
  leader_id uuid NOT NULL REFERENCES public.profiles(id),
  highlights text,
  unfinished text,
  blockers text,
  next_week_plan text,
  status public.report_status NOT NULL DEFAULT 'draft',
  reviewer_id uuid REFERENCES public.profiles(id),
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_reports_unique_team_week UNIQUE (team_id, week_start)
);
CREATE INDEX weekly_reports_week_idx ON public.weekly_reports (week_start DESC);

GRANT SELECT, INSERT, UPDATE ON public.weekly_reports TO authenticated;
GRANT ALL ON public.weekly_reports TO service_role;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

-- ============ Hàm quyền ============
CREATE OR REPLACE FUNCTION public.can_review_daily_report(_author uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND auth.uid() <> _author
     AND (
       public.has_role(auth.uid(),'admin')
       OR public.has_role(auth.uid(),'cmo')
       OR (
         NOT public.has_role(_author,'leader')
         AND public.leader_team_id(auth.uid()) IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = _author AND p.primary_team_id = public.leader_team_id(auth.uid()))
       )
     );
$$;
REVOKE EXECUTE ON FUNCTION public.can_review_daily_report(uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_view_daily_report(_author uuid, _team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() = _author
     OR public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'cmo')
     OR (public.leader_team_id(auth.uid()) IS NOT NULL
         AND (_team = public.leader_team_id(auth.uid())
              OR EXISTS (SELECT 1 FROM public.profiles p
                         WHERE p.id = _author
                           AND p.primary_team_id = public.leader_team_id(auth.uid()))));
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_daily_report(uuid, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_review_weekly_report()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cmo');
$$;
REVOKE EXECUTE ON FUNCTION public.can_review_weekly_report() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_view_weekly_report(_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'cmo')
     OR _team IN (SELECT public.my_team_ids());
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_weekly_report(uuid) FROM anon, authenticated;

-- ============ Trigger kiểm tra báo cáo ngày ============
CREATE OR REPLACE FUNCTION public.validate_daily_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_author boolean;
  _is_reviewer boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.author_id <> auth.uid() THEN
      RAISE EXCEPTION 'Chỉ được tạo báo cáo cho chính mình';
    END IF;
    IF NEW.status NOT IN ('draft','submitted') THEN
      RAISE EXCEPTION 'Báo cáo mới chỉ ở trạng thái Bản nháp hoặc Đã gửi';
    END IF;
    IF NEW.report_date > ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) THEN
      RAISE EXCEPTION 'Không được báo cáo cho ngày trong tương lai';
    END IF;
    IF NEW.status = 'submitted' THEN
      IF COALESCE(btrim(NEW.results),'') = '' OR COALESCE(btrim(NEW.next_plan),'') = '' THEN
        RAISE EXCEPTION 'Phải nhập kết quả đạt được và kế hoạch ngày mai trước khi gửi';
      END IF;
      NEW.submitted_at := now();
    END IF;
    NEW.reviewer_id := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.author_id <> OLD.author_id OR NEW.report_date <> OLD.report_date THEN
    RAISE EXCEPTION 'Không được đổi định danh, người gửi hoặc ngày báo cáo';
  END IF;

  _is_author := auth.uid() = OLD.author_id;
  _is_reviewer := public.can_review_daily_report(OLD.author_id);

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','changes_requested') THEN
    IF NOT _is_reviewer THEN
      RAISE EXCEPTION 'Bạn không có quyền duyệt báo cáo này';
    END IF;
    IF OLD.status <> 'submitted' THEN
      RAISE EXCEPTION 'Chỉ xử lý được báo cáo đang ở trạng thái Đã gửi';
    END IF;
    IF NEW.status = 'changes_requested' AND COALESCE(btrim(NEW.review_note),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập nhận xét khi yêu cầu chỉnh sửa';
    END IF;
    NEW.reviewer_id := auth.uid();
    NEW.reviewed_at := now();
    RETURN NEW;
  END IF;

  IF NOT _is_author THEN
    RAISE EXCEPTION 'Chỉ người gửi được chỉnh sửa nội dung báo cáo';
  END IF;
  IF OLD.status NOT IN ('draft','changes_requested') THEN
    RAISE EXCEPTION 'Báo cáo đã gửi hoặc đã duyệt, không thể chỉnh sửa';
  END IF;
  IF NEW.status NOT IN ('draft','submitted') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ';
  END IF;
  IF NEW.status = 'submitted' THEN
    IF COALESCE(btrim(NEW.results),'') = '' OR COALESCE(btrim(NEW.next_plan),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập kết quả đạt được và kế hoạch ngày mai trước khi gửi';
    END IF;
    NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.audit_daily_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('report.daily_created','daily_report',NEW.id,NULL,
      jsonb_build_object('report_date',NEW.report_date,'status',NEW.status), '{}'::jsonb);
    IF NEW.status = 'submitted' THEN
      PERFORM public.write_audit('report.daily_submitted','daily_report',NEW.id,NULL,
        jsonb_build_object('report_date',NEW.report_date), '{}'::jsonb);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit(
      CASE
        WHEN NEW.status = 'submitted' AND OLD.status = 'changes_requested' THEN 'report.daily_resubmitted'
        WHEN NEW.status = 'submitted' THEN 'report.daily_submitted'
        WHEN NEW.status = 'approved' THEN 'report.daily_approved'
        WHEN NEW.status = 'changes_requested' THEN 'report.daily_changes_requested'
        ELSE 'report.daily_status_changed'
      END,
      'daily_report', NEW.id,
      jsonb_build_object('status',OLD.status),
      jsonb_build_object('status',NEW.status,'note',NEW.review_note), '{}'::jsonb);
  ELSE
    PERFORM public.write_audit('report.daily_updated','daily_report',NEW.id,NULL,
      jsonb_build_object('report_date',NEW.report_date), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER daily_reports_validate BEFORE INSERT OR UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.validate_daily_report();
CREATE TRIGGER daily_reports_updated_at BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER daily_reports_audit AFTER INSERT OR UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_daily_report();

-- ============ Trigger kiểm tra báo cáo tuần ============
CREATE OR REPLACE FUNCTION public.validate_weekly_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_author boolean;
  _is_reviewer boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.leader_id <> auth.uid() THEN
      RAISE EXCEPTION 'Chỉ Leader gửi báo cáo tuần cho Team mình';
    END IF;
    IF NEW.team_id IS DISTINCT FROM public.leader_team_id(auth.uid())
       AND NOT public.has_role(auth.uid(),'admin') THEN
      RAISE EXCEPTION 'Bạn không phải Leader của Team này';
    END IF;
    IF NEW.status NOT IN ('draft','submitted') THEN
      RAISE EXCEPTION 'Báo cáo mới chỉ ở trạng thái Bản nháp hoặc Đã gửi';
    END IF;
    IF EXTRACT(ISODOW FROM NEW.week_start) <> 1 THEN
      RAISE EXCEPTION 'Tuần báo cáo phải bắt đầu từ thứ Hai';
    END IF;
    IF NEW.status = 'submitted' THEN
      IF COALESCE(btrim(NEW.highlights),'') = '' OR COALESCE(btrim(NEW.next_week_plan),'') = '' THEN
        RAISE EXCEPTION 'Phải nhập kết quả nổi bật và kế hoạch tuần tới trước khi gửi';
      END IF;
      NEW.submitted_at := now();
    END IF;
    NEW.reviewer_id := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.team_id <> OLD.team_id OR NEW.week_start <> OLD.week_start
     OR NEW.leader_id <> OLD.leader_id THEN
    RAISE EXCEPTION 'Không được đổi định danh, Team, tuần hoặc người gửi';
  END IF;

  _is_author := auth.uid() = OLD.leader_id;
  _is_reviewer := public.can_review_weekly_report();

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','changes_requested') THEN
    IF NOT _is_reviewer THEN
      RAISE EXCEPTION 'Chỉ CMO hoặc Admin được duyệt báo cáo tuần';
    END IF;
    IF OLD.status <> 'submitted' THEN
      RAISE EXCEPTION 'Chỉ xử lý được báo cáo đang ở trạng thái Đã gửi';
    END IF;
    IF NEW.status = 'changes_requested' AND COALESCE(btrim(NEW.review_note),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập nhận xét khi yêu cầu chỉnh sửa';
    END IF;
    NEW.reviewer_id := auth.uid();
    NEW.reviewed_at := now();
    RETURN NEW;
  END IF;

  IF NOT _is_author THEN
    RAISE EXCEPTION 'Chỉ Leader gửi báo cáo được chỉnh sửa nội dung';
  END IF;
  IF OLD.status NOT IN ('draft','changes_requested') THEN
    RAISE EXCEPTION 'Báo cáo đã gửi hoặc đã duyệt, không thể chỉnh sửa';
  END IF;
  IF NEW.status NOT IN ('draft','submitted') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ';
  END IF;
  IF NEW.status = 'submitted' THEN
    IF COALESCE(btrim(NEW.highlights),'') = '' OR COALESCE(btrim(NEW.next_week_plan),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập kết quả nổi bật và kế hoạch tuần tới trước khi gửi';
    END IF;
    NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.audit_weekly_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('report.weekly_created','weekly_report',NEW.id,NULL,
      jsonb_build_object('week_start',NEW.week_start,'team_id',NEW.team_id,'status',NEW.status), '{}'::jsonb);
    IF NEW.status = 'submitted' THEN
      PERFORM public.write_audit('report.weekly_submitted','weekly_report',NEW.id,NULL,
        jsonb_build_object('week_start',NEW.week_start), '{}'::jsonb);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit(
      CASE
        WHEN NEW.status = 'submitted' AND OLD.status = 'changes_requested' THEN 'report.weekly_resubmitted'
        WHEN NEW.status = 'submitted' THEN 'report.weekly_submitted'
        WHEN NEW.status = 'approved' THEN 'report.weekly_approved'
        WHEN NEW.status = 'changes_requested' THEN 'report.weekly_changes_requested'
        ELSE 'report.weekly_status_changed'
      END,
      'weekly_report', NEW.id,
      jsonb_build_object('status',OLD.status),
      jsonb_build_object('status',NEW.status,'note',NEW.review_note), '{}'::jsonb);
  ELSE
    PERFORM public.write_audit('report.weekly_updated','weekly_report',NEW.id,NULL,
      jsonb_build_object('week_start',NEW.week_start), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER weekly_reports_validate BEFORE INSERT OR UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.validate_weekly_report();
CREATE TRIGGER weekly_reports_updated_at BEFORE UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER weekly_reports_audit AFTER INSERT OR UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_weekly_report();

-- ============ RLS ============
CREATE POLICY daily_reports_select_scoped ON public.daily_reports
  FOR SELECT TO authenticated USING (public.can_view_daily_report(author_id, team_id));
CREATE POLICY daily_reports_insert_self ON public.daily_reports
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY daily_reports_update_scoped ON public.daily_reports
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_review_daily_report(author_id))
  WITH CHECK (author_id = auth.uid() OR public.can_review_daily_report(author_id));

CREATE POLICY weekly_reports_select_scoped ON public.weekly_reports
  FOR SELECT TO authenticated USING (public.can_view_weekly_report(team_id));
CREATE POLICY weekly_reports_insert_leader ON public.weekly_reports
  FOR INSERT TO authenticated WITH CHECK (leader_id = auth.uid());
CREATE POLICY weekly_reports_update_scoped ON public.weekly_reports
  FOR UPDATE TO authenticated
  USING (leader_id = auth.uid() OR public.can_review_weekly_report())
  WITH CHECK (leader_id = auth.uid() OR public.can_review_weekly_report());

-- Cho phép xem nhật ký của chính báo cáo mình được xem
CREATE POLICY audit_logs_select_daily_report ON public.audit_logs
  FOR SELECT TO authenticated USING (
    entity_type = 'daily_report' AND entity_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.daily_reports r WHERE r.id = audit_logs.entity_id
    )
  );
CREATE POLICY audit_logs_select_weekly_report ON public.audit_logs
  FOR SELECT TO authenticated USING (
    entity_type = 'weekly_report' AND entity_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.weekly_reports r WHERE r.id = audit_logs.entity_id
    )
  );