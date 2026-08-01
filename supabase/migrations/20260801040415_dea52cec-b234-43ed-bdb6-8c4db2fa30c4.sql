-- ============ ENUMS ============
CREATE TYPE public.mvp_cycle_status AS ENUM ('collecting','voting','reviewing','pending_publish','published');
CREATE TYPE public.mvp_award_type AS ENUM ('mvp','effective','proactive','teamwork','progress','creative');
CREATE TYPE public.mvp_award_status AS ENUM ('proposed','approved','not_awarded','published');
CREATE TYPE public.mvp_scorecard_status AS ENUM ('draft','computed','reviewed','final','disqualified');
CREATE TYPE public.mvp_review_status AS ENUM ('draft','submitted');

-- ============ mvp_cycles ============
CREATE TABLE public.mvp_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  week_end date NOT NULL,
  status public.mvp_cycle_status NOT NULL DEFAULT 'collecting',
  vote_opens_at timestamptz,
  vote_closes_at timestamptz,
  data_locked_at timestamptz,
  published_by uuid REFERENCES public.profiles(id),
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_cycles_week_range CHECK (week_end > week_start)
);
GRANT SELECT, INSERT, UPDATE ON public.mvp_cycles TO authenticated;
GRANT ALL ON public.mvp_cycles TO service_role;
ALTER TABLE public.mvp_cycles ENABLE ROW LEVEL SECURITY;

-- ============ helper functions ============
CREATE OR REPLACE FUNCTION public.is_mvp_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_mvp_cycle()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cmo');
$$;

CREATE OR REPLACE FUNCTION public.mvp_cycle_status_of(_cycle uuid)
RETURNS public.mvp_cycle_status LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status FROM public.mvp_cycles WHERE id = _cycle;
$$;

CREATE OR REPLACE FUNCTION public.is_mvp_cycle_published(_cycle uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT status = 'published' FROM public.mvp_cycles WHERE id = _cycle), false);
$$;

-- Leader chấm Member trong Team chính; CMO chấm Leader; không ai tự chấm mình.
CREATE OR REPLACE FUNCTION public.can_review_mvp(_subject uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND auth.uid() <> _subject
     AND (
       public.has_role(auth.uid(),'cmo')
       OR (
         NOT public.has_role(_subject,'leader')
         AND NOT public.has_role(_subject,'cmo')
         AND public.leader_team_id(auth.uid()) IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = _subject AND p.primary_team_id = public.leader_team_id(auth.uid()))
       )
     );
$$;

-- Ai được xem điểm chi tiết của một nhân sự trong một kỳ.
CREATE OR REPLACE FUNCTION public.can_view_mvp_scorecard(_cycle uuid, _subject uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() = _subject
     OR public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'cmo')
     OR (public.leader_team_id(auth.uid()) IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = _subject AND p.primary_team_id = public.leader_team_id(auth.uid())))
     OR public.is_mvp_cycle_published(_cycle);
$$;

CREATE POLICY "mvp_cycles_select" ON public.mvp_cycles
  FOR SELECT TO authenticated USING (public.current_app_role() IS NOT NULL);
CREATE POLICY "mvp_cycles_insert" ON public.mvp_cycles
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_mvp_cycle());
CREATE POLICY "mvp_cycles_update" ON public.mvp_cycles
  FOR UPDATE TO authenticated USING (public.can_manage_mvp_cycle()) WITH CHECK (public.can_manage_mvp_cycle());

-- ============ mvp_cycle_tasks ============
CREATE TABLE public.mvp_cycle_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.mvp_cycles(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  weight smallint NOT NULL DEFAULT 1,
  original_deadline timestamptz,
  is_committed boolean NOT NULL DEFAULT true,
  final_status public.task_status,
  is_locked boolean NOT NULL DEFAULT false,
  weight_confirmed_by uuid REFERENCES public.profiles(id),
  weight_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_cycle_tasks_weight_valid CHECK (weight IN (1,2,3,5)),
  CONSTRAINT mvp_cycle_tasks_unique UNIQUE (cycle_id, task_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mvp_cycle_tasks TO authenticated;
GRANT ALL ON public.mvp_cycle_tasks TO service_role;
ALTER TABLE public.mvp_cycle_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvp_cycle_tasks_select" ON public.mvp_cycle_tasks
  FOR SELECT TO authenticated USING (public.can_view_mvp_scorecard(cycle_id, user_id));
CREATE POLICY "mvp_cycle_tasks_insert" ON public.mvp_cycle_tasks
  FOR INSERT TO authenticated WITH CHECK (
    NOT public.is_mvp_cycle_published(cycle_id)
    AND (public.can_manage_mvp_cycle() OR public.can_review_mvp(user_id))
  );
CREATE POLICY "mvp_cycle_tasks_update" ON public.mvp_cycle_tasks
  FOR UPDATE TO authenticated USING (
    NOT public.is_mvp_cycle_published(cycle_id)
    AND (public.can_manage_mvp_cycle() OR public.can_review_mvp(user_id))
  ) WITH CHECK (
    NOT public.is_mvp_cycle_published(cycle_id)
    AND (public.can_manage_mvp_cycle() OR public.can_review_mvp(user_id))
  );
CREATE POLICY "mvp_cycle_tasks_delete" ON public.mvp_cycle_tasks
  FOR DELETE TO authenticated USING (
    NOT public.is_mvp_cycle_published(cycle_id) AND public.can_manage_mvp_cycle()
  );

-- Không cho đổi trọng số khi snapshot đã khóa (trừ Admin/CMO sửa lỗi dữ liệu).
CREATE OR REPLACE FUNCTION public.validate_mvp_cycle_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_locked AND NEW.weight IS DISTINCT FROM OLD.weight
     AND NOT public.can_manage_mvp_cycle() THEN
    RAISE EXCEPTION 'Snapshot đã khóa, chỉ CMO hoặc Admin được sửa trọng số kèm lý do';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_mvp_cycle_task BEFORE INSERT OR UPDATE ON public.mvp_cycle_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_mvp_cycle_task();

-- ============ mvp_scorecards ============
CREATE TABLE public.mvp_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.mvp_cycles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  team_id uuid REFERENCES public.teams(id),
  auto_score numeric(5,1) NOT NULL DEFAULT 0,
  review_score numeric(5,1) NOT NULL DEFAULT 0,
  vote_score numeric(5,1) NOT NULL DEFAULT 0,
  penalty_score numeric(5,1) NOT NULL DEFAULT 0,
  total_score numeric(5,1) NOT NULL DEFAULT 0,
  data_completeness numeric(5,2) NOT NULL DEFAULT 0,
  is_eligible boolean NOT NULL DEFAULT false,
  ineligible_reason text,
  status public.mvp_scorecard_status NOT NULL DEFAULT 'draft',
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_scorecards_unique UNIQUE (cycle_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.mvp_scorecards TO authenticated;
GRANT ALL ON public.mvp_scorecards TO service_role;
ALTER TABLE public.mvp_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvp_scorecards_select" ON public.mvp_scorecards
  FOR SELECT TO authenticated USING (public.can_view_mvp_scorecard(cycle_id, user_id));
CREATE POLICY "mvp_scorecards_insert" ON public.mvp_scorecards
  FOR INSERT TO authenticated WITH CHECK (
    public.can_manage_mvp_cycle() AND NOT public.is_mvp_cycle_published(cycle_id)
  );
CREATE POLICY "mvp_scorecards_update" ON public.mvp_scorecards
  FOR UPDATE TO authenticated USING (
    public.can_manage_mvp_cycle() AND NOT public.is_mvp_cycle_published(cycle_id)
  ) WITH CHECK (
    public.can_manage_mvp_cycle() AND NOT public.is_mvp_cycle_published(cycle_id)
  );

-- ============ mvp_score_components ============
CREATE TABLE public.mvp_score_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.mvp_cycles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  criterion text NOT NULL,
  max_points numeric(5,2) NOT NULL,
  earned_points numeric(5,2) NOT NULL DEFAULT 0,
  formula text,
  source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_applicable boolean NOT NULL DEFAULT true,
  not_applicable_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_score_components_unique UNIQUE (cycle_id, user_id, criterion)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mvp_score_components TO authenticated;
GRANT ALL ON public.mvp_score_components TO service_role;
ALTER TABLE public.mvp_score_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvp_score_components_select" ON public.mvp_score_components
  FOR SELECT TO authenticated USING (public.can_view_mvp_scorecard(cycle_id, user_id));
CREATE POLICY "mvp_score_components_write" ON public.mvp_score_components
  FOR ALL TO authenticated USING (
    public.can_manage_mvp_cycle() AND NOT public.is_mvp_cycle_published(cycle_id)
  ) WITH CHECK (
    public.can_manage_mvp_cycle() AND NOT public.is_mvp_cycle_published(cycle_id)
  );

-- ============ mvp_manual_reviews ============
CREATE TABLE public.mvp_manual_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.mvp_cycles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.profiles(id),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
  quality_score numeric(4,2) NOT NULL DEFAULT 0,
  proactive_score numeric(4,2) NOT NULL DEFAULT 0,
  teamwork_score numeric(4,2) NOT NULL DEFAULT 0,
  reason text,
  evidence text,
  status public.mvp_review_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_reviews_not_self CHECK (subject_id <> reviewer_id),
  CONSTRAINT mvp_reviews_quality_scale CHECK (quality_score IN (0,2.5,5,7.5,10)),
  CONSTRAINT mvp_reviews_proactive_scale CHECK (proactive_score IN (0,2.5,5,7.5,10)),
  CONSTRAINT mvp_reviews_teamwork_scale CHECK (teamwork_score IN (0,1.25,2.5,3.75,5)),
  CONSTRAINT mvp_reviews_unique UNIQUE (cycle_id, subject_id)
);
GRANT SELECT, INSERT, UPDATE ON public.mvp_manual_reviews TO authenticated;
GRANT ALL ON public.mvp_manual_reviews TO service_role;
ALTER TABLE public.mvp_manual_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvp_reviews_select" ON public.mvp_manual_reviews
  FOR SELECT TO authenticated USING (
    reviewer_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'cmo')
    OR (subject_id = auth.uid() AND public.is_mvp_cycle_published(cycle_id))
  );
CREATE POLICY "mvp_reviews_insert" ON public.mvp_manual_reviews
  FOR INSERT TO authenticated WITH CHECK (
    reviewer_id = auth.uid() AND public.can_review_mvp(subject_id)
    AND NOT public.is_mvp_cycle_published(cycle_id)
  );
CREATE POLICY "mvp_reviews_update" ON public.mvp_manual_reviews
  FOR UPDATE TO authenticated USING (
    reviewer_id = auth.uid() AND NOT public.is_mvp_cycle_published(cycle_id)
  ) WITH CHECK (
    reviewer_id = auth.uid() AND public.can_review_mvp(subject_id)
    AND NOT public.is_mvp_cycle_published(cycle_id)
  );

-- Điểm Tốt/Xuất sắc bắt buộc lý do và bằng chứng khi gửi.
CREATE OR REPLACE FUNCTION public.validate_mvp_manual_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.cycle_id <> OLD.cycle_id OR NEW.subject_id <> OLD.subject_id) THEN
    RAISE EXCEPTION 'Không được đổi kỳ hoặc người được đánh giá';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' AND NOT public.has_role(auth.uid(),'admin')
     AND NOT public.has_role(auth.uid(),'cmo') THEN
    RAISE EXCEPTION 'Đánh giá đã gửi, không thể chỉnh sửa';
  END IF;
  IF NEW.status = 'submitted' THEN
    IF COALESCE(btrim(NEW.reason),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập lý do đánh giá';
    END IF;
    IF (NEW.quality_score >= 7.5 OR NEW.proactive_score >= 7.5 OR NEW.teamwork_score >= 3.75)
       AND COALESCE(btrim(NEW.evidence),'') = '' THEN
      RAISE EXCEPTION 'Đánh giá mức Tốt hoặc Xuất sắc bắt buộc có bằng chứng';
    END IF;
    NEW.submitted_at := now();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_mvp_manual_review BEFORE INSERT OR UPDATE ON public.mvp_manual_reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_mvp_manual_review();

-- ============ mvp_votes ============
CREATE TABLE public.mvp_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.mvp_cycles(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id),
  votee_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  is_valid boolean NOT NULL DEFAULT true,
  invalid_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_votes_not_self CHECK (voter_id <> votee_id),
  CONSTRAINT mvp_votes_reason_length CHECK (char_length(btrim(reason)) >= 20),
  CONSTRAINT mvp_votes_one_per_cycle UNIQUE (cycle_id, voter_id)
);
GRANT SELECT, INSERT ON public.mvp_votes TO authenticated;
GRANT ALL ON public.mvp_votes TO service_role;
ALTER TABLE public.mvp_votes ENABLE ROW LEVEL SECURITY;

-- Chỉ người vote xem lại phiếu của mình; Admin xem dữ liệu gốc khi điều tra.
CREATE POLICY "mvp_votes_select_own" ON public.mvp_votes
  FOR SELECT TO authenticated USING (voter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "mvp_votes_insert" ON public.mvp_votes
  FOR INSERT TO authenticated WITH CHECK (
    voter_id = auth.uid()
    AND public.mvp_cycle_status_of(cycle_id) = 'voting'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = votee_id AND p.status = 'active')
  );

CREATE OR REPLACE FUNCTION public.validate_mvp_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _opens timestamptz; _closes timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT vote_opens_at, vote_closes_at INTO _opens, _closes FROM public.mvp_cycles WHERE id = NEW.cycle_id;
  IF _opens IS NOT NULL AND now() < _opens THEN RAISE EXCEPTION 'Kỳ vote chưa mở'; END IF;
  IF _closes IS NOT NULL AND now() > _closes THEN RAISE EXCEPTION 'Kỳ vote đã đóng'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_mvp_vote BEFORE INSERT ON public.mvp_votes
  FOR EACH ROW EXECUTE FUNCTION public.validate_mvp_vote();

-- ============ mvp_award_results ============
CREATE TABLE public.mvp_award_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.mvp_cycles(id) ON DELETE CASCADE,
  award_type public.mvp_award_type NOT NULL,
  recipient_id uuid REFERENCES public.profiles(id),
  award_score numeric(5,1),
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.mvp_award_status NOT NULL DEFAULT 'proposed',
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_awards_unique UNIQUE (cycle_id, award_type)
);
GRANT SELECT, INSERT, UPDATE ON public.mvp_award_results TO authenticated;
GRANT ALL ON public.mvp_award_results TO service_role;
ALTER TABLE public.mvp_award_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvp_awards_select" ON public.mvp_award_results
  FOR SELECT TO authenticated USING (
    public.is_mvp_cycle_published(cycle_id)
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'cmo')
  );
CREATE POLICY "mvp_awards_insert" ON public.mvp_award_results
  FOR INSERT TO authenticated WITH CHECK (
    public.can_manage_mvp_cycle() AND NOT public.is_mvp_cycle_published(cycle_id)
  );
CREATE POLICY "mvp_awards_update" ON public.mvp_award_results
  FOR UPDATE TO authenticated USING (
    public.can_manage_mvp_cycle() AND NOT public.is_mvp_cycle_published(cycle_id)
  ) WITH CHECK (public.can_manage_mvp_cycle());

-- ============ mvp_data_adjustments ============
CREATE TABLE public.mvp_data_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES public.mvp_cycles(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mvp_adjust_reason CHECK (char_length(btrim(reason)) >= 10)
);
GRANT SELECT, INSERT ON public.mvp_data_adjustments TO authenticated;
GRANT ALL ON public.mvp_data_adjustments TO service_role;
ALTER TABLE public.mvp_data_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvp_adjust_select" ON public.mvp_data_adjustments
  FOR SELECT TO authenticated USING (public.can_manage_mvp_cycle());
CREATE POLICY "mvp_adjust_insert" ON public.mvp_data_adjustments
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_mvp_cycle() AND created_by = auth.uid());

-- ============ updated_at triggers ============
CREATE TRIGGER trg_mvp_cycles_updated BEFORE UPDATE ON public.mvp_cycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mvp_cycle_tasks_updated BEFORE UPDATE ON public.mvp_cycle_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mvp_scorecards_updated BEFORE UPDATE ON public.mvp_scorecards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mvp_components_updated BEFORE UPDATE ON public.mvp_score_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mvp_reviews_updated BEFORE UPDATE ON public.mvp_manual_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mvp_awards_updated BEFORE UPDATE ON public.mvp_award_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ audit triggers ============
CREATE OR REPLACE FUNCTION public.audit_mvp_cycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('mvp.cycle_created','mvp_cycle',NEW.id,NULL,
      jsonb_build_object('week_start',NEW.week_start,'status',NEW.status),'{}'::jsonb);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit(
      CASE WHEN NEW.status = 'published' THEN 'mvp.cycle_published' ELSE 'mvp.cycle_status_changed' END,
      'mvp_cycle', NEW.id,
      jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status),'{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_audit_mvp_cycle AFTER INSERT OR UPDATE ON public.mvp_cycles
  FOR EACH ROW EXECUTE FUNCTION public.audit_mvp_cycle();

CREATE OR REPLACE FUNCTION public.audit_mvp_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.write_audit(
    CASE WHEN NEW.status = 'submitted' THEN 'mvp.review_submitted' ELSE 'mvp.review_saved' END,
    'mvp_review', NEW.id, NULL,
    jsonb_build_object('cycle_id',NEW.cycle_id,'subject_id',NEW.subject_id,
      'quality',NEW.quality_score,'proactive',NEW.proactive_score,'teamwork',NEW.teamwork_score),
    '{}'::jsonb);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_audit_mvp_review AFTER INSERT OR UPDATE ON public.mvp_manual_reviews
  FOR EACH ROW EXECUTE FUNCTION public.audit_mvp_review();

-- Ghi nhận đã bỏ phiếu, không ghi người được vote để giữ tính ẩn danh.
CREATE OR REPLACE FUNCTION public.audit_mvp_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.write_audit('mvp.vote_cast','mvp_vote',NEW.cycle_id,NULL,
    jsonb_build_object('cycle_id',NEW.cycle_id),'{}'::jsonb);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_audit_mvp_vote AFTER INSERT ON public.mvp_votes
  FOR EACH ROW EXECUTE FUNCTION public.audit_mvp_vote();

CREATE OR REPLACE FUNCTION public.audit_mvp_award()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.write_audit(
    CASE
      WHEN TG_OP = 'INSERT' THEN 'mvp.award_proposed'
      WHEN NEW.status = 'approved' THEN 'mvp.award_approved'
      WHEN NEW.status = 'not_awarded' THEN 'mvp.award_withheld'
      WHEN NEW.status = 'published' THEN 'mvp.award_published'
      ELSE 'mvp.award_updated' END,
    'mvp_award', NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('status',OLD.status,'recipient_id',OLD.recipient_id) ELSE NULL END,
    jsonb_build_object('award_type',NEW.award_type,'status',NEW.status,'recipient_id',NEW.recipient_id),
    '{}'::jsonb);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_audit_mvp_award AFTER INSERT OR UPDATE ON public.mvp_award_results
  FOR EACH ROW EXECUTE FUNCTION public.audit_mvp_award();

CREATE OR REPLACE FUNCTION public.audit_mvp_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.write_audit('mvp.data_adjusted', NEW.entity_type, NEW.entity_id,
    NEW.before_data, NEW.after_data, jsonb_build_object('reason',NEW.reason,'cycle_id',NEW.cycle_id));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_audit_mvp_adjustment AFTER INSERT ON public.mvp_data_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.audit_mvp_adjustment();

-- ============ indexes ============
CREATE INDEX idx_mvp_cycle_tasks_cycle_user ON public.mvp_cycle_tasks(cycle_id, user_id);
CREATE INDEX idx_mvp_scorecards_cycle ON public.mvp_scorecards(cycle_id, total_score DESC);
CREATE INDEX idx_mvp_components_cycle_user ON public.mvp_score_components(cycle_id, user_id);
CREATE INDEX idx_mvp_reviews_cycle ON public.mvp_manual_reviews(cycle_id);
CREATE INDEX idx_mvp_votes_cycle_votee ON public.mvp_votes(cycle_id, votee_id);
CREATE INDEX idx_mvp_awards_cycle ON public.mvp_award_results(cycle_id);