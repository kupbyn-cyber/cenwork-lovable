REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.app_settings FROM anon;

DROP POLICY IF EXISTS app_settings_select_authenticated ON public.app_settings;
CREATE POLICY app_settings_select_admin ON public.app_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));