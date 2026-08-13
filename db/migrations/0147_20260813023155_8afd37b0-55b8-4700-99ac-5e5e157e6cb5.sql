CREATE TABLE IF NOT EXISTS public.task_comment_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.task_comments(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS task_comment_mentions_task_idx ON public.task_comment_mentions (task_id, user_id);

GRANT SELECT ON public.task_comment_mentions TO authenticated;
GRANT ALL ON public.task_comment_mentions TO service_role;

ALTER TABLE public.task_comment_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_comment_mentions_select ON public.task_comment_mentions;
CREATE POLICY task_comment_mentions_select ON public.task_comment_mentions
  FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));

-- Ứng viên nhắc tên: chỉ những người vốn đã xem được Công việc theo quy tắc hiện hành.
CREATE OR REPLACE FUNCTION public.task_mention_candidates(_task uuid)
RETURNS TABLE(id uuid, display_name text, primary_team_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH t AS (SELECT * FROM public.tasks WHERE id = _task),
  ids AS (
    SELECT t.assignee_id AS uid FROM t
    UNION SELECT t.reviewer_id FROM t
    UNION SELECT t.created_by FROM t
    UNION SELECT tp.user_id FROM public.task_participants tp WHERE tp.task_id = _task
    UNION SELECT pm.user_id FROM public.project_members pm
      JOIN t ON t.project_id = pm.project_id
    UNION SELECT p.owner_id FROM public.projects p JOIN t ON t.project_id = p.id
    UNION SELECT pr.id FROM public.profiles pr JOIN t ON t.team_id IS NOT NULL
      WHERE pr.primary_team_id = t.team_id
    UNION SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','cmo')
  )
  SELECT pr.id, pr.display_name, pr.primary_team_id
  FROM public.profiles pr
  WHERE public.can_view_task(_task)
    AND pr.id IN (SELECT uid FROM ids WHERE uid IS NOT NULL)
    AND pr.status = 'active'
$$;

REVOKE ALL ON FUNCTION public.task_mention_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_mention_candidates(uuid) TO authenticated, service_role;

-- Đăng bình luận kèm nhắc tên; thông báo do database tạo (chỉ CEN, không Telegram).
CREATE OR REPLACE FUNCTION public.task_comment_post(_task uuid, _body text, _mentions uuid[] DEFAULT '{}'::uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me uuid := auth.uid();
  _comment uuid;
  _ids uuid[];
  _u uuid;
  _task_name text;
  _me_name text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  IF NOT public.can_view_task(_task) THEN
    RAISE EXCEPTION 'Bạn không có quyền bình luận trong công việc này';
  END IF;
  IF coalesce(btrim(_body), '') = '' THEN RAISE EXCEPTION 'Nội dung bình luận không được để trống'; END IF;
  IF length(btrim(_body)) > 4000 THEN RAISE EXCEPTION 'Bình luận tối đa 4000 ký tự'; END IF;

  SELECT name INTO _task_name FROM public.tasks WHERE id = _task;
  SELECT display_name INTO _me_name FROM public.profiles WHERE id = _me;

  INSERT INTO public.task_comments (task_id, author_id, body)
  VALUES (_task, _me, btrim(_body))
  RETURNING id INTO _comment;

  IF coalesce(array_length(_mentions, 1), 0) > 0 THEN
    SELECT array_agg(DISTINCT c.id) INTO _ids
      FROM public.task_mention_candidates(_task) c
     WHERE c.id = ANY(_mentions) AND c.id <> _me;

    IF _ids IS NOT NULL THEN
      INSERT INTO public.task_comment_mentions (comment_id, task_id, user_id)
      SELECT _comment, _task, u FROM unnest(_ids) AS u
      ON CONFLICT (comment_id, user_id) DO NOTHING;

      FOREACH _u IN ARRAY _ids LOOP
        INSERT INTO public.notifications (recipient_id, event_type, title, body, entity_type, entity_id, link, event_key)
        VALUES (_u, 'task.mentioned',
          coalesce(_me_name, 'Một thành viên') || ' đã nhắc đến bạn trong một công việc',
          coalesce(_task_name, 'Công việc'), 'task', _task,
          '/tasks/' || _task::text,
          'task.mention:' || _comment::text || ':' || _u::text)
        ON CONFLICT (recipient_id, event_key) DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN _comment;
END; $$;

REVOKE ALL ON FUNCTION public.task_comment_post(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_comment_post(uuid, text, uuid[]) TO authenticated, service_role;