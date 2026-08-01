GRANT EXECUTE ON FUNCTION public.can_manage_mvp_cycle() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mvp_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mvp_cycle_published(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mvp_cycle_status_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_mvp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_mvp_scorecard(uuid, uuid) TO authenticated;