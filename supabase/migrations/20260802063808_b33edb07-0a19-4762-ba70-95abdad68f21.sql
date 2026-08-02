CREATE OR REPLACE FUNCTION public.profiles_require_contact_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := nullif(btrim(coalesce(NEW.phone_number, '')), '');
  v_old_phone text;
  v_phone_changed boolean;
  v_birthday_changed boolean;
BEGIN
  NEW.phone_number := v_phone;

  IF v_phone IS NOT NULL AND v_phone !~ '^[0-9+][0-9 .()-]{7,19}$' THEN
    RAISE EXCEPTION 'Số điện thoại không hợp lệ (8–20 ký tự số).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.birthday IS NOT NULL AND NEW.birthday > (now() AT TIME ZONE 'Asia/Bangkok')::date THEN
    RAISE EXCEPTION 'Ngày sinh không được lớn hơn ngày hiện tại.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Hồ sơ do trigger auth tạo tự động chưa có dữ liệu; bắt buộc được áp dụng ở bước cập nhật hồ sơ.
    RETURN NEW;
  END IF;

  v_old_phone := nullif(btrim(coalesce(OLD.phone_number, '')), '');
  v_phone_changed := v_phone IS DISTINCT FROM v_old_phone;
  v_birthday_changed := NEW.birthday IS DISTINCT FROM OLD.birthday;

  -- Không cho phép xóa trống dữ liệu đã có. Hồ sơ cũ đang thiếu vẫn cập nhật được trường khác.
  IF v_phone IS NULL AND v_old_phone IS NOT NULL THEN
    RAISE EXCEPTION 'Số điện thoại là bắt buộc.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.birthday IS NULL AND OLD.birthday IS NOT NULL THEN
    RAISE EXCEPTION 'Ngày sinh là bắt buộc.' USING ERRCODE = 'check_violation';
  END IF;

  -- Khi chỉnh sửa chính hai trường này thì phải điền đủ cả hai.
  IF (v_phone_changed OR v_birthday_changed) AND (v_phone IS NULL OR NEW.birthday IS NULL) THEN
    RAISE EXCEPTION 'Số điện thoại và ngày sinh là bắt buộc.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_require_contact_fields ON public.profiles;
CREATE TRIGGER trg_profiles_require_contact_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_require_contact_fields();