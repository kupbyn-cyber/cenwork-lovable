-- ORG-VIEW-01: mở quyền XEM cơ cấu tổ chức và danh bạ thành viên cho mọi người đã đăng nhập.
-- Không thay đổi quyền chỉnh sửa: các policy INSERT/UPDATE/DELETE giữ nguyên.

-- A. Cơ cấu Team: dữ liệu cơ cấu, không nhạy cảm.
DROP POLICY IF EXISTS teams_select_directory ON public.teams;
CREATE POLICY teams_select_directory ON public.teams
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS team_collaborators_select_directory ON public.team_collaborators;
CREATE POLICY team_collaborators_select_directory ON public.team_collaborators
  FOR SELECT TO authenticated USING (true);

-- B. Danh bạ thành viên: lọc theo cột ngay trong hàm, không mở rộng RLS của profiles.
CREATE OR REPLACE FUNCTION public.member_directory()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  job_title text,
  status public.account_status,
  primary_team_id uuid,
  telegram_user_id text,
  telegram_enabled boolean,
  telegram_test_status text,
  telegram_tested_at timestamptz,
  telegram_test_error text,
  phone_number text,
  birthday date,
  avatar_path text,
  locked_at timestamptz,
  lock_reason text,
  role public.app_role,
  collaborator_team_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid,
           public.is_system_admin(auth.uid()) AS admin,
           public.leader_team_id(auth.uid()) AS lead_team
  )
  SELECT
    p.id,
    CASE WHEN me.admin OR p.id = me.uid THEN p.email ELSE NULL END,
    p.display_name,
    p.job_title,
    p.status,
    p.primary_team_id,
    CASE WHEN me.admin OR p.id = me.uid THEN p.telegram_user_id ELSE NULL END,
    CASE WHEN me.admin OR p.id = me.uid THEN p.telegram_enabled ELSE NULL END,
    CASE WHEN me.admin OR p.id = me.uid THEN p.telegram_test_status ELSE NULL END,
    CASE WHEN me.admin OR p.id = me.uid THEN p.telegram_tested_at ELSE NULL END,
    CASE WHEN me.admin OR p.id = me.uid THEN p.telegram_test_error ELSE NULL END,
    CASE WHEN me.admin OR p.id = me.uid
              OR (me.lead_team IS NOT NULL AND p.primary_team_id = me.lead_team)
         THEN p.phone_number ELSE NULL END,
    CASE WHEN me.admin OR p.id = me.uid
              OR (me.lead_team IS NOT NULL AND p.primary_team_id = me.lead_team)
         THEN p.birthday ELSE NULL END,
    p.avatar_path,
    CASE WHEN me.admin THEN p.locked_at ELSE NULL END,
    CASE WHEN me.admin THEN p.lock_reason ELSE NULL END,
    CASE WHEN me.admin THEN r.role ELSE NULL END,
    COALESCE(ARRAY(SELECT tc.team_id FROM public.team_collaborators tc WHERE tc.user_id = p.id), '{}'::uuid[])
  FROM public.profiles p
  CROSS JOIN me
  LEFT JOIN public.user_roles r ON r.user_id = p.id
  WHERE me.uid IS NOT NULL
    AND (me.admin OR p.status = 'active')
  ORDER BY p.display_name;
$$;

REVOKE ALL ON FUNCTION public.member_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_directory() TO authenticated, service_role;

-- C. Danh sách tài khoản đã khóa (chỉ id) để hiển thị "***" trong lịch sử.
CREATE OR REPLACE FUNCTION public.locked_member_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(SELECT p.id FROM public.profiles p WHERE p.status <> 'active'), '{}'::uuid[])
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.locked_member_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.locked_member_ids() TO authenticated, service_role;

-- D. Vai trò Nhân viên được xem màn hình Thành viên (chỉ quyền xem).
INSERT INTO public.role_permission_config (role, permission_key, enabled, data_scope)
SELECT 'member'::public.app_role, 'members.view', true, 'organization'
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permission_config
  WHERE role = 'member' AND permission_key = 'members.view'
);

UPDATE public.role_permission_config
   SET enabled = true
 WHERE permission_key IN ('members.view', 'organization.view')
   AND role IN ('member', 'leader', 'cmo', 'admin');