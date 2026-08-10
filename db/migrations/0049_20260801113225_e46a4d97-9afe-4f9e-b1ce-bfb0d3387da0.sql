CREATE OR REPLACE FUNCTION public.enforce_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- thao tác từ backend tin cậy
  END IF;
  IF NEW.id <> OLD.id OR lower(NEW.email) <> lower(OLD.email) THEN
    RAISE EXCEPTION 'Không được đổi định danh hoặc email của tài khoản';
  END IF;
  -- Chỉ Admin/CMO được sửa hồ sơ của người khác.
  IF NEW.id <> auth.uid() AND NOT public.is_system_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Admin hoặc CMO được sửa hồ sơ thành viên khác';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT public.is_system_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Admin hoặc CMO được đổi trạng thái tài khoản';
  END IF;
  IF NEW.primary_team_id IS DISTINCT FROM OLD.primary_team_id
     AND NOT public.is_system_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Admin hoặc CMO được đổi Team chính';
  END IF;
  IF NEW.job_title IS DISTINCT FROM OLD.job_title
     AND NEW.job_title IS NOT NULL
     AND NEW.job_title NOT IN ('Giám đốc', 'Leader', 'Nhân viên') THEN
    RAISE EXCEPTION 'Chức danh chỉ nhận giá trị: Giám đốc, Leader hoặc Nhân viên';
  END IF;
  RETURN NEW;
END; $function$;