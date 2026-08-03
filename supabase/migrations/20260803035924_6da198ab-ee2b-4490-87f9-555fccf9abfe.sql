-- 1) Làm sạch dữ liệu: giữ đúng 1 role/user theo thứ tự ưu tiên
DELETE FROM public.user_roles ur
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id
           ORDER BY CASE role
             WHEN 'admin' THEN 1
             WHEN 'cmo' THEN 2
             WHEN 'leader' THEN 3
             ELSE 4 END
         ) AS rn
  FROM public.user_roles
) d
WHERE ur.id = d.id AND d.rn > 1;

-- 2) Invariant: mỗi user chỉ có một system role
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_role_per_user ON public.user_roles (user_id);

-- 3) Bootstrap: thay thế role thay vì chèn thêm
CREATE OR REPLACE FUNCTION public.bootstrap_create_admin(_user uuid, _display_name text, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cen_bootstrap_admin'));

  IF EXISTS (SELECT 1 FROM public.system_owners) THEN
    RAISE EXCEPTION 'BOOTSTRAP_LOCKED' USING ERRCODE = 'raise_exception';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin' AND p.status = 'active' AND ur.user_id <> _user
  ) THEN
    RAISE EXCEPTION 'BOOTSTRAP_LOCKED' USING ERRCODE = 'raise_exception';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, status, must_change_password, password_changed_at)
  VALUES (_user, _email, _display_name, 'active', false, now())
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        status = 'active',
        must_change_password = false,
        password_changed_at = now(),
        updated_at = now();

  -- Xóa mọi role mặc định (ví dụ member do trigger tạo) trước khi gán Admin
  DELETE FROM public.user_roles WHERE user_id = _user;

  INSERT INTO public.user_roles (user_id, role) VALUES (_user, 'admin');

  INSERT INTO public.system_owners (user_id, created_by)
  VALUES (_user, _user)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.audit_logs (user_id, actor_email, action, entity_type, entity_id, result, metadata)
  VALUES (_user, _email, 'bootstrap_admin_created', 'profiles', _user, 'success',
          jsonb_build_object('source', 'setup_page'));
END;
$function$;

REVOKE ALL ON FUNCTION public.bootstrap_create_admin(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_create_admin(uuid, text, text) TO service_role;