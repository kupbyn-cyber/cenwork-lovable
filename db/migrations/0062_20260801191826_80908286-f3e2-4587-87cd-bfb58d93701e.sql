REVOKE ALL ON public.reports FROM anon;
REVOKE ALL ON public.report_sections FROM anon;
REVOKE ALL ON public.report_links FROM anon;
REVOKE ALL ON public.report_versions FROM anon;
REVOKE ALL ON public.report_reviews FROM anon;
REVOKE ALL ON public.report_reopen_requests FROM anon;
REVOKE ALL ON public.team_weekly_summaries FROM anon;
REVOKE ALL ON public.team_summary_versions FROM anon;

REVOKE ALL ON public.reports FROM authenticated;
REVOKE ALL ON public.report_sections FROM authenticated;
REVOKE ALL ON public.report_links FROM authenticated;
REVOKE ALL ON public.report_versions FROM authenticated;
REVOKE ALL ON public.report_reviews FROM authenticated;
REVOKE ALL ON public.report_reopen_requests FROM authenticated;
REVOKE ALL ON public.team_weekly_summaries FROM authenticated;
REVOKE ALL ON public.team_summary_versions FROM authenticated;

GRANT SELECT ON public.reports TO authenticated;
GRANT SELECT, UPDATE ON public.report_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_links TO authenticated;
GRANT SELECT ON public.report_versions TO authenticated;
GRANT SELECT ON public.report_reviews TO authenticated;
GRANT SELECT ON public.report_reopen_requests TO authenticated;
GRANT SELECT, UPDATE ON public.team_weekly_summaries TO authenticated;
GRANT SELECT ON public.team_summary_versions TO authenticated;

GRANT ALL ON public.reports TO service_role;
GRANT ALL ON public.report_sections TO service_role;
GRANT ALL ON public.report_links TO service_role;
GRANT ALL ON public.report_versions TO service_role;
GRANT ALL ON public.report_reviews TO service_role;
GRANT ALL ON public.report_reopen_requests TO service_role;
GRANT ALL ON public.team_weekly_summaries TO service_role;
GRANT ALL ON public.team_summary_versions TO service_role;