REVOKE EXECUTE ON FUNCTION public.audit_project_link() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_project() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_project() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_project_link() FROM anon, authenticated;