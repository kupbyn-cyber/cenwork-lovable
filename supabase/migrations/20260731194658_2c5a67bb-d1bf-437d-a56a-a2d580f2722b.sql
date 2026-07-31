CREATE POLICY audit_logs_select_task ON public.audit_logs
FOR SELECT TO authenticated
USING (entity_type = 'task' AND entity_id IS NOT NULL AND public.can_view_task(entity_id));