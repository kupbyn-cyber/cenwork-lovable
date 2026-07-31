-- 1) Mở rộng audit_logs
ALTER TABLE public.audit_logs
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS actor_email text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS before_data jsonb,
  ADD COLUMN IF NOT EXISTS after_data jsonb,
  ADD COLUMN IF NOT EXISTS result text NOT NULL DEFAULT 'success';

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);

-- Không cho phép sửa/xóa audit log từ bất kỳ đâu ngoài quyền chủ sở hữu DB
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Nhật ký hoạt động không thể sửa hoặc xóa';
END; $$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- 2) Hàm ghi audit dùng chung
CREATE OR REPLACE FUNCTION public.write_audit(
  _action text,
  _entity_type text,
  _entity_id uuid,
  _before jsonb,
  _after jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _email text;
BEGIN
  SELECT p.email INTO _email FROM public.profiles p WHERE p.id = _actor;
  INSERT INTO public.audit_logs (user_id, actor_email, action, entity_type, entity_id, before_data, after_data, metadata, result)
  VALUES (_actor, COALESCE(_email, 'system'), _action, _entity_type, _entity_id, _before, _after, COALESCE(_metadata, '{}'::jsonb), 'success');
END; $$;

-- 3) Trigger audit theo bảng
CREATE OR REPLACE FUNCTION public.audit_profiles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('account.created', 'profile', NEW.id, NULL,
      jsonb_build_object('email', NEW.email, 'display_name', NEW.display_name), '{}'::jsonb);
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.write_audit(
        CASE WHEN NEW.status = 'locked' THEN 'account.locked' ELSE 'account.unlocked' END,
        'profile', NEW.id,
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status), '{}'::jsonb);
    END IF;
    IF NEW.primary_team_id IS DISTINCT FROM OLD.primary_team_id THEN
      PERFORM public.write_audit('member.primary_team_changed', 'profile', NEW.id,
        jsonb_build_object('primary_team_id', OLD.primary_team_id),
        jsonb_build_object('primary_team_id', NEW.primary_team_id), '{}'::jsonb);
    END IF;
    IF NEW.display_name IS DISTINCT FROM OLD.display_name OR NEW.job_title IS DISTINCT FROM OLD.job_title THEN
      PERFORM public.write_audit('member.profile_updated', 'profile', NEW.id,
        jsonb_build_object('display_name', OLD.display_name, 'job_title', OLD.job_title),
        jsonb_build_object('display_name', NEW.display_name, 'job_title', NEW.job_title), '{}'::jsonb);
    END IF;
    IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password AND NEW.must_change_password = false THEN
      PERFORM public.write_audit('account.password_changed', 'profile', NEW.id, NULL, NULL, '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS audit_profiles_trg ON public.profiles;
CREATE TRIGGER audit_profiles_trg
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles();

CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('role.granted', 'user_role', NEW.user_id, NULL,
      jsonb_build_object('role', NEW.role), '{}'::jsonb);
    RETURN NEW;
  ELSE
    PERFORM public.write_audit('role.revoked', 'user_role', OLD.user_id,
      jsonb_build_object('role', OLD.role), NULL, '{}'::jsonb);
    RETURN OLD;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS audit_user_roles_trg ON public.user_roles;
CREATE TRIGGER audit_user_roles_trg
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

CREATE OR REPLACE FUNCTION public.audit_teams()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('team.created', 'team', NEW.id, NULL,
      jsonb_build_object('name', NEW.name, 'leader_id', NEW.leader_id), '{}'::jsonb);
  ELSE
    PERFORM public.write_audit('team.updated', 'team', NEW.id,
      jsonb_build_object('name', OLD.name, 'leader_id', OLD.leader_id),
      jsonb_build_object('name', NEW.name, 'leader_id', NEW.leader_id), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS audit_teams_trg ON public.teams;
CREATE TRIGGER audit_teams_trg
  AFTER INSERT OR UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.audit_teams();

CREATE OR REPLACE FUNCTION public.audit_team_collaborators()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('team.collaborator_added', 'team', NEW.team_id, NULL,
      jsonb_build_object('user_id', NEW.user_id), '{}'::jsonb);
    RETURN NEW;
  END IF;
  PERFORM public.write_audit('team.collaborator_removed', 'team', OLD.team_id,
    jsonb_build_object('user_id', OLD.user_id), NULL, '{}'::jsonb);
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS audit_team_collaborators_trg ON public.team_collaborators;
CREATE TRIGGER audit_team_collaborators_trg
  AFTER INSERT OR DELETE ON public.team_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.audit_team_collaborators();

CREATE OR REPLACE FUNCTION public.audit_facilities()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('facility.created', 'facility', NEW.id, NULL,
      jsonb_build_object('name', NEW.name, 'address', NEW.address, 'is_active', NEW.is_active), '{}'::jsonb);
  ELSE
    PERFORM public.write_audit(
      CASE WHEN NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.is_active = false
           THEN 'facility.deactivated' ELSE 'facility.updated' END,
      'facility', NEW.id,
      jsonb_build_object('name', OLD.name, 'address', OLD.address, 'is_active', OLD.is_active),
      jsonb_build_object('name', NEW.name, 'address', NEW.address, 'is_active', NEW.is_active), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS audit_facilities_trg ON public.facilities;
CREATE TRIGGER audit_facilities_trg
  AFTER INSERT OR UPDATE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.audit_facilities();

-- 4) Bảng cấu hình hệ thống
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_select_authenticated ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY app_settings_insert_admin ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY app_settings_update_admin ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS app_settings_set_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.audit_app_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.write_audit('setting.updated', 'app_setting', NULL,
    CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('key', OLD.key, 'value', OLD.value) ELSE NULL END,
    jsonb_build_object('key', NEW.key, 'value', NEW.value),
    jsonb_build_object('key', NEW.key));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS audit_app_settings_trg ON public.app_settings;
CREATE TRIGGER audit_app_settings_trg
  AFTER INSERT OR UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_app_settings();

INSERT INTO public.app_settings (key, value, description) VALUES
  ('org_name', '{"text":"CEN"}'::jsonb, 'Tên tổ chức hiển thị trong hệ thống'),
  ('default_temp_password', '{"text":"Cen@123456"}'::jsonb, 'Mật khẩu tạm mặc định khi tạo tài khoản, bắt buộc đổi ở lần đăng nhập đầu'),
  ('session_idle_minutes', '{"number":60}'::jsonb, 'Số phút không hoạt động trước khi cảnh báo phiên')
ON CONFLICT (key) DO NOTHING;