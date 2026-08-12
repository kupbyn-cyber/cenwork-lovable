-- TASK-PERF-01 — perm_scope chỉ tính đúng 1 quyền thay vì duyệt toàn bộ danh mục.
-- Logic bật/tắt, override và quyền bất biến của chủ hệ thống giữ nguyên tuyệt đối;
-- chỉ khác ở chỗ không còn gọi perm_effective() (36 dòng) cho mỗi lần kiểm tra RLS.
CREATE OR REPLACE FUNCTION public.perm_scope(_user uuid, _key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN
        (CASE
          WHEN public.is_system_owner(_user) AND c.permission_key = ANY(public.perm_invariant_keys()) THEN true
          WHEN o.override_type = 'deny' THEN false
          WHEN o.override_type = 'allow' THEN true
          ELSE COALESCE(rp.enabled, false)
        END)
      THEN COALESCE(
        CASE WHEN public.is_system_owner(_user) AND c.permission_key = ANY(public.perm_invariant_keys())
             THEN 'organization' END,
        o.data_scope, rp.data_scope, 'own')
      ELSE NULL END
     FROM public.permission_catalog c
     LEFT JOIN public.role_permission_config rp
       ON rp.permission_key = c.permission_key AND rp.role = public.perm_role_of(_user)
     LEFT JOIN public.user_permission_overrides o
       ON o.permission_key = c.permission_key AND o.user_id = _user
     WHERE c.permission_key = _key),
    'none');
$$;

CREATE INDEX IF NOT EXISTS idx_tasks_deadline_live ON public.tasks (deadline) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_participants_task ON public.task_participants (task_id);
