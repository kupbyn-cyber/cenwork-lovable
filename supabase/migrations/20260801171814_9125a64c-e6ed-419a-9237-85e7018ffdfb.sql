CREATE OR REPLACE FUNCTION public.validate_project_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'project_facilities' THEN
    IF NOT EXISTS (SELECT 1 FROM public.facilities f WHERE f.id = NEW.facility_id AND f.is_active) THEN
      RAISE EXCEPTION 'Cơ sở không còn hoạt động';
    END IF;
  ELSIF TG_TABLE_NAME = 'project_members' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.status = 'active') THEN
      RAISE EXCEPTION 'Thành viên tham gia phải đang hoạt động';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;