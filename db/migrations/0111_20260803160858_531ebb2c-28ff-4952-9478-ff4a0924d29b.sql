CREATE OR REPLACE FUNCTION public.reject_locked_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _target uuid;
  _old uuid;
BEGIN
  IF TG_TABLE_NAME = 'tasks' THEN
    _target := NEW.assignee_id;
    IF TG_OP = 'UPDATE' THEN _old := OLD.assignee_id; END IF;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    _target := NEW.owner_id;
    IF TG_OP = 'UPDATE' THEN _old := OLD.owner_id; END IF;
  ELSIF TG_TABLE_NAME = 'teams' THEN
    _target := NEW.leader_id;
    IF TG_OP = 'UPDATE' THEN _old := OLD.leader_id; END IF;
  ELSIF TG_TABLE_NAME IN ('task_participants','team_collaborators') THEN
    _target := NEW.user_id;
    IF TG_OP = 'UPDATE' THEN _old := OLD.user_id; END IF;
  END IF;

  IF _target IS NOT NULL
     AND (TG_OP = 'INSERT' OR _target IS DISTINCT FROM _old)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _target AND status <> 'active')
  THEN
    RAISE EXCEPTION 'Không thể giao trách nhiệm mới cho tài khoản đã khóa.';
  END IF;

  RETURN NEW;
END;
$function$;