REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leader_team_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_primary_team_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leader_team_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_primary_team_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_profile(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_team_leader() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_collaborator() FROM PUBLIC, anon, authenticated;