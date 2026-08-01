GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_targets TO authenticated;
GRANT ALL ON public.announcement_targets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_recipients TO authenticated;
GRANT ALL ON public.announcement_recipients TO service_role;