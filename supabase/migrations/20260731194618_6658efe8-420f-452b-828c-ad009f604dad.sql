REVOKE EXECUTE ON FUNCTION public.can_view_task(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_task(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_edit_task_row(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_create_task(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_assign_task(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_in_project_scope(uuid, uuid) FROM anon, authenticated;