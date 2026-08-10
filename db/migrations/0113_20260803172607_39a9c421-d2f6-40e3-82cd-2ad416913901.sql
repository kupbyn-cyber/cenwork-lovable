REVOKE ALL ON FUNCTION public.can_view_task_approval_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_task_approval_events(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.task_approval_events_since() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_approval_events_since() TO authenticated, service_role;
ALTER FUNCTION public.task_approval_events_since() SET search_path TO 'public';

REVOKE ALL ON FUNCTION public.task_approval_events_append_only() FROM PUBLIC, anon, authenticated;