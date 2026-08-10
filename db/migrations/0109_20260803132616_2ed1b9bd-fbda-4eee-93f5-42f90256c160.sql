CREATE OR REPLACE FUNCTION public.recognition_directory()
RETURNS TABLE(id uuid, display_name text, job_title text, avatar_path text, primary_team_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.job_title, p.avatar_path, p.primary_team_id
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.status = 'active'
    AND p.locked_at IS NULL
  ORDER BY p.display_name;
$$;

REVOKE ALL ON FUNCTION public.recognition_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recognition_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_recognize(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _target IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND public.recognition_actor_active(auth.uid())
     AND public.recognition_actor_active(_target)
$$;