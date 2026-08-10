-- 1) Seed danh mục Trực nhật vào bộ mặc định
CREATE OR REPLACE FUNCTION public.ensure_catalog_defaults()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _area int := 0;
  _job int := 0;
  _prov int := 0;
BEGIN
  WITH src(name, sort_order) AS (
    VALUES
      ('Khu vực chung — Toàn bộ phòng họp', 10),
      ('Khu vực chung — Hành lang phía trước văn phòng', 20),
      ('Nhà vệ sinh — Nhà vệ sinh Nam tầng 2', 30),
      ('Nhà vệ sinh — Nhà vệ sinh Nữ tầng 2', 40),
      ('Khu vực riêng — Bên trái: Kế toán, HR, QC', 50),
      ('Khu vực riêng — Bên phải: Marketing, Telesale', 60)
  ), ins AS (
    INSERT INTO public.duty_areas (name, sort_order)
    SELECT s.name, s.sort_order FROM src s
    ON CONFLICT (name) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _area FROM ins;

  WITH src(name, sort_order) AS (
    VALUES
      ('Đổ rác', 10),
      ('Trực nhật không gian riêng', 20),
      ('Tưới cây', 30),
      ('Lau bàn sếp', 40)
  ), ins AS (
    INSERT INTO public.duty_job_types (name, sort_order)
    SELECT s.name, s.sort_order FROM src s
    ON CONFLICT (name) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _job FROM ins;

  WITH src(name, sort_order) AS (
    VALUES
      ('App quét dọn', 10),
      ('App lau kính', 20)
  ), ins AS (
    INSERT INTO public.duty_external_providers (name, sort_order)
    SELECT s.name, s.sort_order FROM src s
    ON CONFLICT (name) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _prov FROM ins;

  RETURN jsonb_build_object('duty_areas_added', _area, 'duty_job_types_added', _job, 'duty_providers_added', _prov);
END;
$function$;

-- 2) Siết quyền xem cấu hình phân quyền / chủ hệ thống
DROP POLICY IF EXISTS "owners readable" ON public.system_owners;
CREATE POLICY "system_owners_admin_read" ON public.system_owners
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "overrides readable" ON public.user_permission_overrides;
CREATE POLICY "overrides_admin_or_self_read" ON public.user_permission_overrides
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

DROP POLICY IF EXISTS "change sets readable" ON public.permission_change_sets;
CREATE POLICY "change_sets_admin_read" ON public.permission_change_sets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Thu hồi EXECUTE của anon / PUBLIC trên toàn bộ hàm public
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname <> 'bootstrap_create_admin'
      AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END
$do$;