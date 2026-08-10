-- CEN-MB-01 — Lớp tương thích để chạy toàn bộ schema CEN trên PostgreSQL thuần.
-- Thay thế hạ tầng Supabase (auth/storage/roles) bằng bản tối thiểu do CEN sở hữu.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS cron;

-- Các role kế thừa từ mô hình cũ: giữ tên để 243 policy/GRANT chạy nguyên trạng.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  -- Role thật mà CEN server dùng cho mỗi request (RLS luôn áp dụng).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cen_app') THEN
    CREATE ROLE cen_app NOLOGIN;
  END IF;
END$$;

GRANT authenticated TO cen_app;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role, cen_app;

-- Bảng người dùng gốc do CEN quản lý (thay auth.users của Supabase).
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  encrypted_password text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_confirmed_at timestamptz DEFAULT now(),
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON auth.users (lower(email));

-- Phiên đăng nhập do server CEN cấp; logout/khóa tài khoản là vô hiệu ngay.
CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON auth.sessions (user_id);

-- Danh tính của request: server đặt cen.user_id trong transaction.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('cen.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('cen.role', true), ''), 'anon')
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('sub', current_setting('cen.user_id', true), 'role', auth.role())
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt()
  TO anon, authenticated, service_role, cen_app;
GRANT SELECT ON auth.users TO authenticated, service_role;

-- Storage tối thiểu: CEN chưa upload binary, nhưng policy cũ tham chiếu tới đây.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(name, '/')
$$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true), ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- pg_cron không có trên PostgreSQL thuần: shim no-op để migration cũ chạy được.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
    RETURNS bigint LANGUAGE sql AS 'SELECT 0::bigint';
    CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
    RETURNS boolean LANGUAGE sql AS 'SELECT true';
  END IF;
END$$;
