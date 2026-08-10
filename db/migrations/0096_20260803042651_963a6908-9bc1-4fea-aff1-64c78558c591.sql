CREATE OR REPLACE FUNCTION public.ensure_system_defaults()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _perm_added int := 0;
  _role_added int := 0;
  _setting_added int := 0;
BEGIN
  WITH src(permission_key, module, label, description, allowed_scopes, is_configurable, is_sensitive, sort_order) AS (
    VALUES
      ('members.view','Thành viên','Xem danh sách thành viên','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,10),
      ('members.create','Thành viên','Tạo tài khoản thành viên','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,20),
      ('members.edit_scoped','Thành viên','Sửa hồ sơ thành viên trong phạm vi','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,30),
      ('members.lock','Thành viên','Khóa / mở khóa tài khoản','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,TRUE,40),
      ('members.reset_password','Thành viên','Cấp mật khẩu tạm cho Leader / Member','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,TRUE,50),
      ('roles.view','Vai trò','Xem vai trò và quyền','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,60),
      ('roles.assign','Vai trò','Gán vai trò hệ thống','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,TRUE,70),
      ('permissions.manage','Vai trò','Quản lý phân quyền động','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,TRUE,80),
      ('organization.view','Tổ chức','Xem Team và Cơ sở','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,90),
      ('organization.manage','Tổ chức','Tạo / sửa Team và Cơ sở','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,100),
      ('settings.admin','Hệ thống','Cấu hình quản trị hệ thống','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,TRUE,110),
      ('audit.view','Hệ thống','Xem nhật ký hoạt động','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,TRUE,120),
      ('projects.view','Dự án','Xem dự án trong phạm vi','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,130),
      ('projects.create','Dự án','Tạo dự án','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,140),
      ('projects.approve_leader','Dự án','Duyệt dự án ở bước Leader','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,150),
      ('projects.approve_cmo','Dự án','Duyệt dự án ở bước CMO','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,160),
      ('tasks.view','Công việc','Xem công việc trong phạm vi','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,170),
      ('tasks.create','Công việc','Tạo công việc','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,180),
      ('reports.view','Báo cáo','Xem báo cáo trong phạm vi','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,190),
      ('reports.submit_daily','Báo cáo','Gửi báo cáo ngày','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,200),
      ('reports.review_daily','Báo cáo','Duyệt báo cáo ngày','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,210),
      ('reports.submit_weekly','Báo cáo','Gửi báo cáo tuần của Team','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,220),
      ('reports.review_weekly','Báo cáo','Duyệt báo cáo tuần','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,230),
      ('reports.obligations_view','Báo cáo','Xem nghĩa vụ báo cáo trong phạm vi','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,240),
      ('reports.config','Báo cáo','Cấu hình quy tắc và kỳ báo cáo','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,250),
      ('telegram.manage','Hệ thống','Quản lý kết nối Telegram','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,260),
      ('mvp.view','MVP và danh hiệu','Xem MVP và danh hiệu','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,270),
      ('mvp.vote','MVP và danh hiệu','Bỏ phiếu MVP','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,280),
      ('mvp.review','MVP và danh hiệu','Chấm điểm đánh giá thực tế','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,290),
      ('mvp.approve','MVP và danh hiệu','Phê duyệt và công bố danh hiệu','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,300),
      ('mvp.manage','MVP và danh hiệu','Quản lý kỳ MVP và dữ liệu chấm điểm','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,310),
      ('announcements.view','Thông báo nội bộ','Xem thông báo nội bộ','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,320),
      ('announcements.create','Thông báo nội bộ','Soạn và phát hành thông báo nội bộ','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,330),
      ('approvals.view','Phê duyệt','Xem module Phê duyệt','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,340),
      ('approvals.create','Phê duyệt','Tạo yêu cầu phê duyệt','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,350),
      ('approvals.admin_view','Phê duyệt','Xem toàn bộ yêu cầu phê duyệt trong hệ thống','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,360)
  ), ins AS (
    INSERT INTO public.permission_catalog
      (permission_key, module, label, description, allowed_scopes, is_configurable, is_sensitive, sort_order)
    SELECT s.permission_key, s.module, s.label, NULLIF(s.description,''), s.allowed_scopes,
           s.is_configurable, s.is_sensitive, s.sort_order
    FROM src s
    ON CONFLICT (permission_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _perm_added FROM ins;

  WITH src(role, permission_key, enabled, data_scope) AS (
    VALUES
      ('admin'::app_role,'announcements.create',TRUE,'organization'),
      ('admin'::app_role,'announcements.view',TRUE,'organization'),
      ('admin'::app_role,'approvals.admin_view',TRUE,'organization'),
      ('admin'::app_role,'approvals.create',TRUE,'organization'),
      ('admin'::app_role,'approvals.view',TRUE,'organization'),
      ('admin'::app_role,'audit.view',TRUE,'organization'),
      ('admin'::app_role,'members.create',TRUE,'organization'),
      ('admin'::app_role,'members.edit_scoped',TRUE,'organization'),
      ('admin'::app_role,'members.lock',TRUE,'organization'),
      ('admin'::app_role,'members.reset_password',TRUE,'organization'),
      ('admin'::app_role,'members.view',TRUE,'organization'),
      ('admin'::app_role,'mvp.approve',TRUE,'organization'),
      ('admin'::app_role,'mvp.manage',TRUE,'organization'),
      ('admin'::app_role,'mvp.review',TRUE,'organization'),
      ('admin'::app_role,'mvp.view',TRUE,'organization'),
      ('admin'::app_role,'mvp.vote',TRUE,'organization'),
      ('admin'::app_role,'organization.manage',TRUE,'organization'),
      ('admin'::app_role,'organization.view',TRUE,'organization'),
      ('admin'::app_role,'permissions.manage',TRUE,'organization'),
      ('admin'::app_role,'projects.approve_cmo',TRUE,'organization'),
      ('admin'::app_role,'projects.approve_leader',TRUE,'organization'),
      ('admin'::app_role,'projects.create',TRUE,'organization'),
      ('admin'::app_role,'projects.view',TRUE,'organization'),
      ('admin'::app_role,'reports.config',FALSE,'organization'),
      ('admin'::app_role,'reports.obligations_view',TRUE,'organization'),
      ('admin'::app_role,'reports.review_daily',TRUE,'organization'),
      ('admin'::app_role,'reports.review_weekly',TRUE,'organization'),
      ('admin'::app_role,'reports.submit_daily',TRUE,'organization'),
      ('admin'::app_role,'reports.submit_weekly',FALSE,'organization'),
      ('admin'::app_role,'reports.view',TRUE,'organization'),
      ('admin'::app_role,'roles.assign',TRUE,'organization'),
      ('admin'::app_role,'roles.view',TRUE,'organization'),
      ('admin'::app_role,'settings.admin',TRUE,'organization'),
      ('admin'::app_role,'tasks.create',TRUE,'organization'),
      ('admin'::app_role,'tasks.view',TRUE,'organization'),
      ('admin'::app_role,'telegram.manage',TRUE,'organization'),
      ('cmo'::app_role,'announcements.create',TRUE,'organization'),
      ('cmo'::app_role,'announcements.view',TRUE,'organization'),
      ('cmo'::app_role,'approvals.admin_view',TRUE,'organization'),
      ('cmo'::app_role,'approvals.create',TRUE,'organization'),
      ('cmo'::app_role,'approvals.view',TRUE,'organization'),
      ('cmo'::app_role,'audit.view',TRUE,'organization'),
      ('cmo'::app_role,'members.create',TRUE,'organization'),
      ('cmo'::app_role,'members.edit_scoped',TRUE,'organization'),
      ('cmo'::app_role,'members.lock',TRUE,'organization'),
      ('cmo'::app_role,'members.reset_password',TRUE,'organization'),
      ('cmo'::app_role,'members.view',TRUE,'organization'),
      ('cmo'::app_role,'mvp.approve',TRUE,'organization'),
      ('cmo'::app_role,'mvp.manage',TRUE,'organization'),
      ('cmo'::app_role,'mvp.review',TRUE,'organization'),
      ('cmo'::app_role,'mvp.view',TRUE,'organization'),
      ('cmo'::app_role,'mvp.vote',TRUE,'organization'),
      ('cmo'::app_role,'organization.manage',TRUE,'organization'),
      ('cmo'::app_role,'organization.view',TRUE,'organization'),
      ('cmo'::app_role,'permissions.manage',TRUE,'organization'),
      ('cmo'::app_role,'projects.approve_cmo',TRUE,'organization'),
      ('cmo'::app_role,'projects.approve_leader',TRUE,'organization'),
      ('cmo'::app_role,'projects.create',TRUE,'organization'),
      ('cmo'::app_role,'projects.view',TRUE,'organization'),
      ('cmo'::app_role,'reports.config',TRUE,'organization'),
      ('cmo'::app_role,'reports.obligations_view',TRUE,'organization'),
      ('cmo'::app_role,'reports.review_daily',TRUE,'organization'),
      ('cmo'::app_role,'reports.review_weekly',TRUE,'organization'),
      ('cmo'::app_role,'reports.submit_daily',TRUE,'organization'),
      ('cmo'::app_role,'reports.submit_weekly',FALSE,'organization'),
      ('cmo'::app_role,'reports.view',TRUE,'organization'),
      ('cmo'::app_role,'roles.assign',TRUE,'organization'),
      ('cmo'::app_role,'roles.view',TRUE,'organization'),
      ('cmo'::app_role,'settings.admin',TRUE,'organization'),
      ('cmo'::app_role,'tasks.create',TRUE,'organization'),
      ('cmo'::app_role,'tasks.view',TRUE,'organization'),
      ('cmo'::app_role,'telegram.manage',TRUE,'organization'),
      ('leader'::app_role,'announcements.create',TRUE,'team'),
      ('leader'::app_role,'announcements.view',TRUE,'team'),
      ('leader'::app_role,'approvals.admin_view',FALSE,'team'),
      ('leader'::app_role,'approvals.create',TRUE,'team'),
      ('leader'::app_role,'approvals.view',TRUE,'team'),
      ('leader'::app_role,'audit.view',FALSE,'team'),
      ('leader'::app_role,'members.create',FALSE,'team'),
      ('leader'::app_role,'members.edit_scoped',TRUE,'team'),
      ('leader'::app_role,'members.lock',FALSE,'team'),
      ('leader'::app_role,'members.reset_password',FALSE,'team'),
      ('leader'::app_role,'members.view',TRUE,'team'),
      ('leader'::app_role,'mvp.approve',FALSE,'team'),
      ('leader'::app_role,'mvp.manage',FALSE,'team'),
      ('leader'::app_role,'mvp.review',TRUE,'team'),
      ('leader'::app_role,'mvp.view',TRUE,'team'),
      ('leader'::app_role,'mvp.vote',TRUE,'team'),
      ('leader'::app_role,'organization.manage',FALSE,'team'),
      ('leader'::app_role,'organization.view',TRUE,'team'),
      ('leader'::app_role,'permissions.manage',FALSE,'team'),
      ('leader'::app_role,'projects.approve_cmo',FALSE,'team'),
      ('leader'::app_role,'projects.approve_leader',TRUE,'team'),
      ('leader'::app_role,'projects.create',TRUE,'team'),
      ('leader'::app_role,'projects.view',TRUE,'team'),
      ('leader'::app_role,'reports.config',FALSE,'team'),
      ('leader'::app_role,'reports.obligations_view',TRUE,'team'),
      ('leader'::app_role,'reports.review_daily',TRUE,'team'),
      ('leader'::app_role,'reports.review_weekly',FALSE,'team'),
      ('leader'::app_role,'reports.submit_daily',TRUE,'team'),
      ('leader'::app_role,'reports.submit_weekly',TRUE,'team'),
      ('leader'::app_role,'reports.view',TRUE,'team'),
      ('leader'::app_role,'roles.assign',FALSE,'team'),
      ('leader'::app_role,'roles.view',TRUE,'team'),
      ('leader'::app_role,'settings.admin',FALSE,'team'),
      ('leader'::app_role,'tasks.create',TRUE,'team'),
      ('leader'::app_role,'tasks.view',TRUE,'team'),
      ('leader'::app_role,'telegram.manage',FALSE,'team'),
      ('member'::app_role,'announcements.create',TRUE,'own'),
      ('member'::app_role,'announcements.view',TRUE,'own'),
      ('member'::app_role,'approvals.admin_view',FALSE,'own'),
      ('member'::app_role,'approvals.create',TRUE,'own'),
      ('member'::app_role,'approvals.view',TRUE,'own'),
      ('member'::app_role,'audit.view',FALSE,'own'),
      ('member'::app_role,'members.create',FALSE,'own'),
      ('member'::app_role,'members.edit_scoped',FALSE,'own'),
      ('member'::app_role,'members.lock',FALSE,'own'),
      ('member'::app_role,'members.reset_password',FALSE,'own'),
      ('member'::app_role,'members.view',FALSE,'own'),
      ('member'::app_role,'mvp.approve',FALSE,'own'),
      ('member'::app_role,'mvp.manage',FALSE,'own'),
      ('member'::app_role,'mvp.review',FALSE,'own'),
      ('member'::app_role,'mvp.view',TRUE,'own'),
      ('member'::app_role,'mvp.vote',TRUE,'own'),
      ('member'::app_role,'organization.manage',FALSE,'own'),
      ('member'::app_role,'organization.view',TRUE,'own'),
      ('member'::app_role,'permissions.manage',FALSE,'own'),
      ('member'::app_role,'projects.approve_cmo',FALSE,'related_projects'),
      ('member'::app_role,'projects.approve_leader',FALSE,'related_projects'),
      ('member'::app_role,'projects.create',TRUE,'related_projects'),
      ('member'::app_role,'projects.view',TRUE,'related_projects'),
      ('member'::app_role,'reports.config',FALSE,'own'),
      ('member'::app_role,'reports.obligations_view',TRUE,'own'),
      ('member'::app_role,'reports.review_daily',FALSE,'own'),
      ('member'::app_role,'reports.review_weekly',FALSE,'own'),
      ('member'::app_role,'reports.submit_daily',TRUE,'own'),
      ('member'::app_role,'reports.submit_weekly',FALSE,'own'),
      ('member'::app_role,'reports.view',TRUE,'own'),
      ('member'::app_role,'roles.assign',FALSE,'own'),
      ('member'::app_role,'roles.view',FALSE,'own'),
      ('member'::app_role,'settings.admin',FALSE,'own'),
      ('member'::app_role,'tasks.create',TRUE,'assigned_or_participating'),
      ('member'::app_role,'tasks.view',TRUE,'assigned_or_participating'),
      ('member'::app_role,'telegram.manage',FALSE,'own')
  ), ins AS (
    INSERT INTO public.role_permission_config (role, permission_key, enabled, data_scope)
    SELECT s.role, s.permission_key, s.enabled, s.data_scope
    FROM src s
    WHERE EXISTS (SELECT 1 FROM public.permission_catalog c WHERE c.permission_key = s.permission_key)
    ON CONFLICT (role, permission_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _role_added FROM ins;

  WITH src(key, value, description) AS (
    VALUES
      ('org_name', '{"text":"CEN"}'::jsonb, 'Ten to chuc hien thi tren giao dien'),
      ('default_temp_password', '{"text":"Cen@12345"}'::jsonb, 'Mat khau tam mac dinh khi cap lai cho thanh vien'),
      ('session_idle_minutes', '{"number":30}'::jsonb, 'So phut khong hoat dong truoc khi canh bao phien')
  ), ins AS (
    INSERT INTO public.app_settings (key, value, description)
    SELECT s.key, s.value, s.description FROM src s
    ON CONFLICT (key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _setting_added FROM ins;

  RETURN jsonb_build_object('permissions_added', _perm_added, 'role_config_added', _role_added, 'settings_added', _setting_added);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ensure_system_defaults() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_system_defaults() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_system_defaults() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_system_defaults() TO service_role;

SELECT public.ensure_system_defaults();