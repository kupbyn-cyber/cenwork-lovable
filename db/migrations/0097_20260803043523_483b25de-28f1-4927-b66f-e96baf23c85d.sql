CREATE OR REPLACE FUNCTION public.verify_system_defaults()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _perms int;
  _cfg int;
  _missing text[];
  _settings int;
BEGIN
  SELECT count(*) INTO _perms FROM public.permission_catalog;
  SELECT count(*) INTO _cfg FROM public.role_permission_config;

  SELECT coalesce(array_agg(c.permission_key || ':' || r.role::text ORDER BY c.permission_key, r.role::text), '{}')
    INTO _missing
  FROM public.permission_catalog c
  CROSS JOIN (SELECT unnest(ARRAY['admin','cmo','leader','member']::app_role[]) AS role) r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permission_config rc
    WHERE rc.permission_key = c.permission_key AND rc.role = r.role
  );

  SELECT count(*) INTO _settings
  FROM public.app_settings
  WHERE key IN ('org_name', 'default_temp_password', 'session_idle_minutes');

  RETURN jsonb_build_object(
    'permissions', _perms,
    'role_config', _cfg,
    'missing_role_config', to_jsonb(_missing),
    'required_settings', _settings,
    'ok', (_perms > 0 AND array_length(_missing, 1) IS NULL AND _settings = 3)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.verify_system_defaults() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_system_defaults() FROM anon;
REVOKE ALL ON FUNCTION public.verify_system_defaults() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_system_defaults() TO service_role;

CREATE OR REPLACE FUNCTION public.verify_admin_bootstrap(_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _required text[] := ARRAY['members.create','roles.assign','organization.manage','settings.admin','permissions.manage','audit.view'];
  _missing text[];
  _role app_role;
  _owner boolean;
BEGIN
  SELECT role INTO _role FROM public.user_roles WHERE user_id = _user;
  SELECT EXISTS (SELECT 1 FROM public.system_owners WHERE user_id = _user) INTO _owner;

  SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO _missing
  FROM unnest(_required) AS k
  WHERE NOT public.has_perm(_user, k);

  RETURN jsonb_build_object(
    'role', _role,
    'is_system_owner', _owner,
    'missing_permissions', to_jsonb(_missing),
    'ok', (_role = 'admin'::app_role AND _owner AND array_length(_missing, 1) IS NULL)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.verify_admin_bootstrap(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_admin_bootstrap(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.verify_admin_bootstrap(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_bootstrap(uuid) TO service_role;