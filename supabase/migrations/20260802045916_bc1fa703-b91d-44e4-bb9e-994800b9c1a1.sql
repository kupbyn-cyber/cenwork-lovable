-- DUTY-01: nền tảng lịch trực nhật
CREATE TYPE public.duty_status AS ENUM ('pending', 'completed', 'overdue');

-- Helper quyền quản lý lịch trực nhật (Admin/CMO/Leader)
CREATE OR REPLACE FUNCTION public.can_manage_duty()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_active_account(auth.uid())
     AND public.current_app_role() IN ('admin','cmo','leader');
$$;

-- 1. Nhóm trực nhật (độc lập với public.teams)
CREATE TABLE public.duty_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_teams TO authenticated;
GRANT ALL ON public.duty_teams TO service_role;
ALTER TABLE public.duty_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duty_teams_select" ON public.duty_teams FOR SELECT TO authenticated USING (public.is_active_account(auth.uid()));
CREATE POLICY "duty_teams_write" ON public.duty_teams FOR ALL TO authenticated USING (public.can_manage_duty()) WITH CHECK (public.can_manage_duty());
CREATE TRIGGER duty_teams_updated_at BEFORE UPDATE ON public.duty_teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Khu vực
CREATE TABLE public.duty_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_areas TO authenticated;
GRANT ALL ON public.duty_areas TO service_role;
ALTER TABLE public.duty_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duty_areas_select" ON public.duty_areas FOR SELECT TO authenticated USING (public.is_active_account(auth.uid()));
CREATE POLICY "duty_areas_write" ON public.duty_areas FOR ALL TO authenticated USING (public.can_manage_duty()) WITH CHECK (public.can_manage_duty());
CREATE TRIGGER duty_areas_updated_at BEFORE UPDATE ON public.duty_areas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Nhiệm vụ trực nhật
CREATE TABLE public.duty_job_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_job_types TO authenticated;
GRANT ALL ON public.duty_job_types TO service_role;
ALTER TABLE public.duty_job_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duty_job_types_select" ON public.duty_job_types FOR SELECT TO authenticated USING (public.is_active_account(auth.uid()));
CREATE POLICY "duty_job_types_write" ON public.duty_job_types FOR ALL TO authenticated USING (public.can_manage_duty()) WITH CHECK (public.can_manage_duty());
CREATE TRIGGER duty_job_types_updated_at BEFORE UPDATE ON public.duty_job_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Dịch vụ ngoài (không có tài khoản đăng nhập)
CREATE TABLE public.duty_external_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  note text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_external_providers TO authenticated;
GRANT ALL ON public.duty_external_providers TO service_role;
ALTER TABLE public.duty_external_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duty_providers_select" ON public.duty_external_providers FOR SELECT TO authenticated USING (public.is_active_account(auth.uid()));
CREATE POLICY "duty_providers_write" ON public.duty_external_providers FOR ALL TO authenticated USING (public.can_manage_duty()) WITH CHECK (public.can_manage_duty());
CREATE TRIGGER duty_providers_updated_at BEFORE UPDATE ON public.duty_external_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Nội quy / tiêu chuẩn vệ sinh (chỉ để xem)
CREATE TABLE public.duty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_rules TO authenticated;
GRANT ALL ON public.duty_rules TO service_role;
ALTER TABLE public.duty_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duty_rules_select" ON public.duty_rules FOR SELECT TO authenticated USING (public.is_active_account(auth.uid()));
CREATE POLICY "duty_rules_write" ON public.duty_rules FOR ALL TO authenticated USING (public.can_manage_duty()) WITH CHECK (public.can_manage_duty());
CREATE TRIGGER duty_rules_updated_at BEFORE UPDATE ON public.duty_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Phân công trực nhật
CREATE TABLE public.duty_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_date date NOT NULL,
  start_time time NOT NULL DEFAULT '17:30',
  end_time time NOT NULL DEFAULT '18:30',
  due_time time NOT NULL DEFAULT '21:00',
  area_id uuid NOT NULL REFERENCES public.duty_areas(id) ON DELETE RESTRICT,
  job_type_id uuid NOT NULL REFERENCES public.duty_job_types(id) ON DELETE RESTRICT,
  duty_team_id uuid REFERENCES public.duty_teams(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  external_provider_id uuid REFERENCES public.duty_external_providers(id) ON DELETE SET NULL,
  note text,
  status public.duty_status NOT NULL DEFAULT 'pending',
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duty_assignment_has_owner CHECK (assignee_id IS NOT NULL OR external_provider_id IS NOT NULL)
);
CREATE INDEX duty_assignments_date_idx ON public.duty_assignments (duty_date);
CREATE INDEX duty_assignments_assignee_idx ON public.duty_assignments (assignee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_assignments TO authenticated;
GRANT ALL ON public.duty_assignments TO service_role;
ALTER TABLE public.duty_assignments ENABLE ROW LEVEL SECURITY;
-- Mọi tài khoản đang hoạt động đều xem được lịch
CREATE POLICY "duty_assignments_select" ON public.duty_assignments FOR SELECT TO authenticated USING (public.is_active_account(auth.uid()));
-- Chỉ Admin/CMO/Leader được tạo, sửa, xóa lịch
CREATE POLICY "duty_assignments_insert" ON public.duty_assignments FOR INSERT TO authenticated WITH CHECK (public.can_manage_duty());
CREATE POLICY "duty_assignments_update" ON public.duty_assignments FOR UPDATE TO authenticated USING (public.can_manage_duty()) WITH CHECK (public.can_manage_duty());
CREATE POLICY "duty_assignments_delete" ON public.duty_assignments FOR DELETE TO authenticated USING (public.can_manage_duty());
CREATE TRIGGER duty_assignments_updated_at BEFORE UPDATE ON public.duty_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Chốt trạng thái hoàn thành đi kèm dữ liệu người/thời điểm
CREATE OR REPLACE FUNCTION public.enforce_duty_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF NEW.assignee_id IS NULL THEN
      RAISE EXCEPTION 'Lịch chỉ giao cho dịch vụ ngoài không thể bấm hoàn thành.';
    END IF;
    IF NEW.completed_by IS NULL THEN NEW.completed_by := auth.uid(); END IF;
    IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  ELSE
    NEW.completed_by := NULL;
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER duty_assignments_enforce BEFORE INSERT OR UPDATE ON public.duty_assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_duty_assignment();

-- Bấm hoàn thành / mở lại: người được phân công, hoặc Admin/CMO/Leader
CREATE OR REPLACE FUNCTION public.duty_set_completed(_assignment uuid, _completed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r public.duty_assignments%ROWTYPE;
BEGIN
  IF NOT public.is_active_account(auth.uid()) THEN
    RAISE EXCEPTION 'Bạn không có quyền thực hiện thao tác này.';
  END IF;
  SELECT * INTO r FROM public.duty_assignments WHERE id = _assignment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lịch trực nhật.'; END IF;
  IF r.assignee_id IS NULL THEN
    RAISE EXCEPTION 'Lịch chỉ giao cho dịch vụ ngoài không cần bấm hoàn thành.';
  END IF;
  IF NOT (public.can_manage_duty()
          OR r.assignee_id = auth.uid()
          OR (NOT _completed AND r.completed_by = auth.uid())) THEN
    RAISE EXCEPTION 'Bạn không có quyền thực hiện thao tác này.';
  END IF;

  IF _completed THEN
    UPDATE public.duty_assignments
       SET status = 'completed', completed_by = auth.uid(), completed_at = now()
     WHERE id = _assignment;
  ELSE
    UPDATE public.duty_assignments
       SET status = CASE
             WHEN (duty_date + due_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' < now() THEN 'overdue'::public.duty_status
             ELSE 'pending'::public.duty_status END,
           completed_by = NULL, completed_at = NULL
     WHERE id = _assignment;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.duty_set_completed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duty_set_completed(uuid, boolean) TO authenticated;

-- Đánh dấu quá hạn cho lịch chưa hoàn thành đã qua 21:00
CREATE OR REPLACE FUNCTION public.duty_mark_overdue()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.duty_assignments
     SET status = 'overdue'
   WHERE status = 'pending'
     AND assignee_id IS NOT NULL
     AND (duty_date + due_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
REVOKE EXECUTE ON FUNCTION public.duty_mark_overdue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duty_mark_overdue() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_manage_duty() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_duty() TO authenticated;

-- ===== Dữ liệu nền =====
INSERT INTO public.duty_teams (name, sort_order) VALUES
  ('Team KT/HR/QC', 1),
  ('Team MKT/Telesale', 2);

INSERT INTO public.duty_areas (name, description, sort_order) VALUES
  ('Khu vực chung', 'Phòng họp và hành lang phía trước văn phòng', 1),
  ('Nhà vệ sinh', 'Nhà vệ sinh Nam/Nữ tầng 2', 2),
  ('Khu vực riêng', 'Từng bộ phận tự đảm bảo sạch sẽ', 3),
  ('Hành lang trước văn phòng', NULL, 4),
  ('Phòng họp', NULL, 5),
  ('Bàn sếp/cây xanh', NULL, 6);

INSERT INTO public.duty_job_types (name, sort_order) VALUES
  ('Quét dọn', 1),
  ('Lau kính', 2),
  ('Đổ rác', 3),
  ('Trực nhật không gian riêng', 4),
  ('Tưới cây', 5),
  ('Lau bàn sếp', 6);

INSERT INTO public.duty_external_providers (name, note, sort_order) VALUES
  ('App quét dọn', 'Dịch vụ ngoài: không có tài khoản, không nhận thông báo, không bấm hoàn thành', 1),
  ('App lau kính', 'Dịch vụ ngoài: không có tài khoản, không nhận thông báo, không bấm hoàn thành', 2);

INSERT INTO public.duty_rules (category, title, content, sort_order) VALUES
  ('Thời gian', 'Thời gian trực nhật', 'Trực nhật từ 17:30 đến 18:30 hằng ngày.', 1),
  ('Thời gian', 'Hạn ghi nhận quá hạn', 'Sau 21:00 cùng ngày, lịch chưa hoàn thành được ghi nhận là quá hạn.', 2),
  ('Khu vực', 'Khu vực chung', 'Bao gồm phòng họp và hành lang phía trước văn phòng.', 3),
  ('Khu vực', 'Nhà vệ sinh', 'Nhà vệ sinh Nam/Nữ tầng 2.', 4),
  ('Khu vực', 'Khu vực riêng', 'Từng bộ phận tự đảm bảo khu vực làm việc của mình sạch sẽ.', 5),
  ('Tiêu chuẩn', 'Xử lý rác', 'Rác tập kết tại nhà rác/thùng rác tầng 1, xếp gọn gàng, không ảnh hưởng khu vực bếp.', 6);