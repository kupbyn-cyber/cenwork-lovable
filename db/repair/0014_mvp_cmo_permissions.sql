-- MVP-PERM-01 — Chuẩn hóa quyền CMO cho module MVP.
-- Idempotent: bảo đảm 5 permission key MVP tồn tại và CMO luôn được bật ở phạm vi organization.
-- Không đụng tới quyền của admin/leader/member và không mở rộng CMO ra ngoài module MVP.

INSERT INTO public.permission_catalog
  (permission_key, module, label, description, allowed_scopes, is_configurable, is_sensitive, sort_order)
VALUES
  ('mvp.view','MVP và danh hiệu','Xem MVP và danh hiệu','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,270),
  ('mvp.vote','MVP và danh hiệu','Bỏ phiếu MVP','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,280),
  ('mvp.review','MVP và danh hiệu','Chấm điểm đánh giá thực tế','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,290),
  ('mvp.approve','MVP và danh hiệu','Phê duyệt và công bố danh hiệu','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,300),
  ('mvp.manage','MVP và danh hiệu','Quản lý kỳ MVP và dữ liệu chấm điểm','','{own,assigned_or_participating,team,related_projects,organization}'::text[],TRUE,FALSE,310)
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.role_permission_config (role, permission_key, enabled, data_scope)
SELECT 'cmo'::app_role, k, TRUE, 'organization'
FROM unnest(ARRAY['mvp.view','mvp.vote','mvp.review','mvp.approve','mvp.manage']) AS k
ON CONFLICT (role, permission_key)
DO UPDATE SET enabled = TRUE, data_scope = 'organization', updated_at = now();

-- Gỡ mọi override đang chặn quyền MVP của tài khoản CMO (override 'allow' của người khác giữ nguyên).
DELETE FROM public.user_permission_overrides o
USING public.user_roles ur
WHERE ur.user_id = o.user_id
  AND ur.role = 'cmo'::app_role
  AND o.permission_key LIKE 'mvp.%'
  AND o.override_type = 'deny';
