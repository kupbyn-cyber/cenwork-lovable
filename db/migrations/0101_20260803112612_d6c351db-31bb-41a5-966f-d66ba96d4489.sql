-- 1. Cho phép nhập tùy chỉnh Khu vực / Nhiệm vụ
ALTER TABLE public.duty_assignments
  ALTER COLUMN area_id DROP NOT NULL,
  ALTER COLUMN job_type_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS area_custom text,
  ADD COLUMN IF NOT EXISTS job_custom text;

ALTER TABLE public.duty_assignments
  DROP CONSTRAINT IF EXISTS duty_assignment_area_choice,
  DROP CONSTRAINT IF EXISTS duty_assignment_job_choice;

ALTER TABLE public.duty_assignments
  ADD CONSTRAINT duty_assignment_area_choice CHECK (
    (area_id IS NOT NULL AND area_custom IS NULL)
    OR (area_id IS NULL AND area_custom IS NOT NULL AND btrim(area_custom) <> '')
  ),
  ADD CONSTRAINT duty_assignment_job_choice CHECK (
    (job_type_id IS NOT NULL AND job_custom IS NULL)
    OR (job_type_id IS NULL AND job_custom IS NOT NULL AND btrim(job_custom) <> '')
  );

-- 2. Seed danh mục (idempotent theo tên, không ghi đè dữ liệu đã có)
INSERT INTO public.duty_areas (name, sort_order)
VALUES
  ('Khu vực chung — Toàn bộ phòng họp', 10),
  ('Khu vực chung — Hành lang phía trước văn phòng', 20),
  ('Nhà vệ sinh — Nhà vệ sinh Nam tầng 2', 30),
  ('Nhà vệ sinh — Nhà vệ sinh Nữ tầng 2', 40),
  ('Khu vực riêng — Bên trái: Kế toán, HR, QC', 50),
  ('Khu vực riêng — Bên phải: Marketing, Telesale', 60)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.duty_job_types (name, sort_order)
VALUES
  ('Đổ rác', 10),
  ('Trực nhật không gian riêng', 20),
  ('Tưới cây', 30),
  ('Lau bàn sếp', 40)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.duty_external_providers (name, sort_order)
VALUES
  ('App quét dọn', 10),
  ('App lau kính', 20)
ON CONFLICT (name) DO NOTHING;