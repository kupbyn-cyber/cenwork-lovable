-- REPORT-02 (1/3): schema, grants, RLS

ALTER TYPE public.report_kind ADD VALUE IF NOT EXISTS 'project_closure';

DO $$ BEGIN
  CREATE TYPE public.report_doc_status AS ENUM
    ('draft','submitted','pending_review','revision_required','confirmed','reopened','published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_review_action AS ENUM
    ('comment','request_revision','confirm','reopen_request','reopen_approve','reopen_reject','summary_feedback');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_submission_kind AS ENUM ('initial','resubmit','reopen');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_link_kind AS ENUM ('task','project','url','text');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ reports ============
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid UNIQUE REFERENCES public.report_obligations(id) ON DELETE SET NULL,
  period_id uuid REFERENCES public.report_periods(id) ON DELETE SET NULL,
  report_type public.report_kind NOT NULL,
  period_key text NOT NULL,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  status public.report_doc_status NOT NULL DEFAULT 'draft',
  requires_ack boolean NOT NULL DEFAULT true,
  due_at timestamptz,
  first_submitted_at timestamptz,
  last_submitted_at timestamptz,
  reviewer_id uuid REFERENCES public.profiles(id),
  confirmed_by uuid REFERENCES public.profiles(id),
  confirmed_at timestamptz,
  current_version integer NOT NULL DEFAULT 0,
  revision_round integer NOT NULL DEFAULT 0,
  legacy_daily_id uuid,
  legacy_weekly_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_author_idx ON public.reports (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_reviewer_idx ON public.reports (reviewer_id, status);
CREATE INDEX IF NOT EXISTS reports_project_idx ON public.reports (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.report_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  done_work text,
  results text,
  unfinished text,
  blockers text,
  next_plan text,
  support_needed text,
  no_work_flag boolean NOT NULL DEFAULT false,
  no_work_reason text,
  no_backlog_flag boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, team_id)
);
CREATE INDEX IF NOT EXISTS report_sections_team_idx ON public.report_sections (team_id);

CREATE TABLE IF NOT EXISTS public.report_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.report_sections(id) ON DELETE CASCADE,
  link_type public.report_link_kind NOT NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  url text,
  evidence_text text,
  summary text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_links_report_idx ON public.report_links (report_id);

CREATE TABLE IF NOT EXISTS public.report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  version integer NOT NULL,
  submission_kind public.report_submission_kind NOT NULL,
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, version)
);

CREATE TABLE IF NOT EXISTS public.report_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  summary_id uuid,
  version integer,
  round integer NOT NULL DEFAULT 0,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  action public.report_review_action NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_reviews_report_idx ON public.report_reviews (report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.report_reopen_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  planned_changes text NOT NULL,
  status public.report_exemption_status NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_reopen_report_idx ON public.report_reopen_requests (report_id, status);

CREATE TABLE IF NOT EXISTS public.team_weekly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  leader_id uuid NOT NULL REFERENCES public.profiles(id),
  status public.report_doc_status NOT NULL DEFAULT 'draft',
  system_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  highlights text,
  unfinished text,
  blockers text,
  next_priorities text,
  support_needed text,
  submission_note text,
  current_version integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, week_start)
);

CREATE TABLE IF NOT EXISTS public.team_summary_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id uuid NOT NULL REFERENCES public.team_weekly_summaries(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  system_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (summary_id, version)
);

-- ============ grants ============
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_links TO authenticated;
GRANT SELECT ON public.report_versions TO authenticated;
GRANT SELECT ON public.report_reviews TO authenticated;
GRANT SELECT ON public.report_reopen_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.team_weekly_summaries TO authenticated;
GRANT SELECT ON public.team_summary_versions TO authenticated;
GRANT ALL ON public.reports, public.report_sections, public.report_links, public.report_versions,
  public.report_reviews, public.report_reopen_requests, public.team_weekly_summaries,
  public.team_summary_versions TO service_role;

-- ============ visibility helpers ============
CREATE OR REPLACE FUNCTION public.report_doc_visible(_report uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.reports r
    where r.id = _report
      and (
        r.author_id = auth.uid()
        or r.reviewer_id = auth.uid()
        or public.report_config_manager()
        or exists (
          select 1 from public.report_sections s
          where s.report_id = r.id and s.team_id is not null and public.report_team_leader(s.team_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.report_section_visible(_section uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.report_sections s
    join public.reports r on r.id = s.report_id
    where s.id = _section
      and (
        r.author_id = auth.uid()
        or public.report_config_manager()
        or (s.team_id is not null and public.report_team_leader(s.team_id))
        or (r.reviewer_id = auth.uid() and (s.team_id is null or public.report_team_leader(s.team_id) or r.report_type::text in ('project','project_closure')))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.report_doc_editable(_report uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.reports r
    where r.id = _report and r.author_id = auth.uid()
      and r.status in ('draft','submitted','pending_review','revision_required','reopened')
  );
$$;

CREATE OR REPLACE FUNCTION public.team_summary_visible(_summary uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.team_weekly_summaries s
    where s.id = _summary
      and (s.leader_id = auth.uid() or public.report_config_manager() or public.report_team_leader(s.team_id))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.report_doc_visible(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.report_section_visible(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.report_doc_editable(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.team_summary_visible(uuid) FROM public, anon;

-- ============ RLS ============
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_reopen_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_summary_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_select ON public.reports FOR SELECT TO authenticated
  USING (public.report_doc_visible(id));
CREATE POLICY reports_insert ON public.reports FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY reports_update ON public.reports FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND status IN ('draft','revision_required','reopened'))
  WITH CHECK (author_id = auth.uid());

CREATE POLICY report_sections_select ON public.report_sections FOR SELECT TO authenticated
  USING (public.report_section_visible(id));
CREATE POLICY report_sections_write ON public.report_sections FOR INSERT TO authenticated
  WITH CHECK (public.report_doc_editable(report_id));
CREATE POLICY report_sections_update ON public.report_sections FOR UPDATE TO authenticated
  USING (public.report_doc_editable(report_id)) WITH CHECK (public.report_doc_editable(report_id));
CREATE POLICY report_sections_delete ON public.report_sections FOR DELETE TO authenticated
  USING (public.report_doc_editable(report_id));

CREATE POLICY report_links_select ON public.report_links FOR SELECT TO authenticated
  USING (public.report_doc_visible(report_id)
         AND (section_id IS NULL OR public.report_section_visible(section_id)));
CREATE POLICY report_links_write ON public.report_links FOR INSERT TO authenticated
  WITH CHECK (public.report_doc_editable(report_id));
CREATE POLICY report_links_update ON public.report_links FOR UPDATE TO authenticated
  USING (public.report_doc_editable(report_id)) WITH CHECK (public.report_doc_editable(report_id));
CREATE POLICY report_links_delete ON public.report_links FOR DELETE TO authenticated
  USING (public.report_doc_editable(report_id));

CREATE POLICY report_versions_select ON public.report_versions FOR SELECT TO authenticated
  USING (public.report_doc_visible(report_id));
CREATE POLICY report_reviews_select ON public.report_reviews FOR SELECT TO authenticated
  USING ((report_id IS NOT NULL AND public.report_doc_visible(report_id))
         OR (summary_id IS NOT NULL AND public.team_summary_visible(summary_id)));
CREATE POLICY report_reopen_select ON public.report_reopen_requests FOR SELECT TO authenticated
  USING (public.report_doc_visible(report_id));

CREATE POLICY team_summary_select ON public.team_weekly_summaries FOR SELECT TO authenticated
  USING (public.team_summary_visible(id));
CREATE POLICY team_summary_insert ON public.team_weekly_summaries FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid() AND public.report_team_leader(team_id));
CREATE POLICY team_summary_update ON public.team_weekly_summaries FOR UPDATE TO authenticated
  USING (leader_id = auth.uid() AND status IN ('draft','revision_required'))
  WITH CHECK (leader_id = auth.uid());
CREATE POLICY team_summary_versions_select ON public.team_summary_versions FOR SELECT TO authenticated
  USING (public.team_summary_visible(summary_id));

-- updated_at triggers
CREATE TRIGGER set_reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_report_sections_updated_at BEFORE UPDATE ON public.report_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_report_links_updated_at BEFORE UPDATE ON public.report_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_report_reopen_updated_at BEFORE UPDATE ON public.report_reopen_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_team_summary_updated_at BEFORE UPDATE ON public.team_weekly_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();