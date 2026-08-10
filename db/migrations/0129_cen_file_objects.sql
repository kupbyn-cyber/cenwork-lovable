-- CEN-MB-02 — Lưu trữ tệp (ảnh đại diện) ngay trong PostgreSQL.
-- Bản deploy độc lập trên Mắt Bão không có dịch vụ Storage riêng, nên tệp nhỏ
-- được lưu trong bảng có RLS: đọc dành cho người dùng đã đăng nhập, ghi chỉ
-- trong thư mục của chính chủ tài khoản.

CREATE TABLE IF NOT EXISTS public.file_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  path text NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT file_objects_bucket_path_key UNIQUE (bucket, path),
  CONSTRAINT file_objects_size_limit CHECK (byte_size > 0 AND byte_size <= 5242880)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_objects TO authenticated;
GRANT ALL ON public.file_objects TO service_role;

ALTER TABLE public.file_objects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'file_objects'
       AND policyname = 'file_objects_read_authenticated'
  ) THEN
    CREATE POLICY file_objects_read_authenticated
      ON public.file_objects FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'file_objects'
       AND policyname = 'file_objects_write_own'
  ) THEN
    CREATE POLICY file_objects_write_own
      ON public.file_objects FOR ALL TO authenticated
      USING (owner_id = auth.uid() OR split_part(path, '/', 1) = auth.uid()::text)
      WITH CHECK (owner_id = auth.uid() AND split_part(path, '/', 1) = auth.uid()::text);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS file_objects_owner_idx ON public.file_objects (owner_id);

DROP TRIGGER IF EXISTS file_objects_set_updated_at ON public.file_objects;
CREATE TRIGGER file_objects_set_updated_at
  BEFORE UPDATE ON public.file_objects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();