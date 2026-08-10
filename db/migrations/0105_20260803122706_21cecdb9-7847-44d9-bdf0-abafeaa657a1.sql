CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_comments_task_created_idx ON public.task_comments (task_id, created_at DESC);
CREATE INDEX task_comments_author_idx ON public.task_comments (author_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_comments_select ON public.task_comments
  FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));

CREATE POLICY task_comments_insert ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.can_view_task(task_id));

CREATE POLICY task_comments_update ON public.task_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY task_comments_delete ON public.task_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_manage_task(task_id));

CREATE TRIGGER task_comments_set_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.task_comment_reads (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX task_comment_reads_user_idx ON public.task_comment_reads (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comment_reads TO authenticated;
GRANT ALL ON public.task_comment_reads TO service_role;

ALTER TABLE public.task_comment_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_comment_reads_own ON public.task_comment_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.task_unread_comment_counts()
RETURNS TABLE(task_id uuid, unread integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.task_id, count(*)::int AS unread
  FROM public.task_comments c
  LEFT JOIN public.task_comment_reads r
    ON r.task_id = c.task_id AND r.user_id = auth.uid()
  WHERE c.author_id <> auth.uid()
    AND (r.last_read_at IS NULL OR c.created_at > r.last_read_at)
  GROUP BY c.task_id
$$;

REVOKE EXECUTE ON FUNCTION public.task_unread_comment_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_unread_comment_counts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.task_comments_mark_read(_task uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;
  INSERT INTO public.task_comment_reads(task_id, user_id, last_read_at)
  VALUES (_task, auth.uid(), now())
  ON CONFLICT (task_id, user_id) DO UPDATE SET last_read_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.task_comments_mark_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_comments_mark_read(uuid) TO authenticated, service_role;