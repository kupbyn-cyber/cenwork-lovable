REVOKE ALL ON FUNCTION public.bootstrap_create_admin(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_create_admin(uuid, text, text) TO service_role;