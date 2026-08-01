CREATE OR REPLACE FUNCTION public.is_announcement_recipient(_announcement uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.announcement_recipients r
                 WHERE r.announcement_id = _announcement AND r.user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.announcement_author(_announcement uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.created_by FROM public.announcements a WHERE a.id = _announcement;
$$;

REVOKE ALL ON FUNCTION public.is_announcement_recipient(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.announcement_author(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_announcement_recipient(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_author(uuid) TO authenticated;

DROP POLICY IF EXISTS ann_select ON public.announcements;
CREATE POLICY ann_select ON public.announcements FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'cmo')
    OR public.is_announcement_recipient(id, auth.uid())
  )
);

DROP POLICY IF EXISTS ann_recipients_select ON public.announcement_recipients;
CREATE POLICY ann_recipients_select ON public.announcement_recipients FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'cmo')
  OR public.announcement_author(announcement_id) = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = announcement_recipients.user_id
               AND p.primary_team_id IS NOT NULL
               AND p.primary_team_id = public.leader_team_id(auth.uid()))
);