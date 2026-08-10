
-- 1. Cột lưu trữ trạng thái khóa
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS lock_reason text,
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS unlocked_by uuid REFERENCES public.profiles(id);

-- 2. Kiểm tra trách nhiệm chưa chuyển giao
CREATE OR REPLACE FUNCTION public.member_lock_blockers(_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _teams jsonb;
  _projects jsonb;
  _tasks jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Chỉ Admin được thực hiện thao tác này.';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) ORDER BY t.name), '[]'::jsonb)
    INTO _teams FROM public.teams t WHERE t.leader_id = _user;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status::text) ORDER BY p.name), '[]'::jsonb)
    INTO _projects
    FROM public.projects p
   WHERE p.owner_id = _user
     AND p.deleted_at IS NULL
     AND p.status NOT IN ('completed', 'archived', 'rejected');

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'status', k.status::text) ORDER BY k.deadline NULLS LAST, k.name), '[]'::jsonb)
    INTO _tasks
    FROM public.tasks k
   WHERE k.assignee_id = _user
     AND k.deleted_at IS NULL
     AND k.is_archived = false
     AND k.status <> 'done';

  RETURN jsonb_build_object(
    'teams', _teams,
    'projects', _projects,
    'tasks', _tasks,
    'total', jsonb_array_length(_teams) + jsonb_array_length(_projects) + jsonb_array_length(_tasks)
  );
END;
$$;

-- 3. Khóa tài khoản
CREATE OR REPLACE FUNCTION public.member_lock(_user uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _blockers jsonb;
  _before text;
  _owner_count int;
BEGIN
  IF NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Chỉ Admin được khóa tài khoản.';
  END IF;
  IF _user = _actor THEN
    RAISE EXCEPTION 'Không thể tự khóa tài khoản của chính mình.';
  END IF;
  IF coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'Lý do khóa là bắt buộc.';
  END IF;

  SELECT status::text INTO _before FROM public.profiles WHERE id = _user;
  IF _before IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản này.';
  END IF;
  IF _before = 'locked' THEN
    RAISE EXCEPTION 'Tài khoản này đã bị khóa.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.system_owners WHERE user_id = _user) THEN
    SELECT count(*) INTO _owner_count FROM public.system_owners;
    IF _owner_count <= 1 THEN
      RAISE EXCEPTION 'Không thể khóa chủ sở hữu hệ thống cuối cùng.';
    END IF;
  END IF;

  _blockers := public.member_lock_blockers(_user);

  IF (_blockers->>'total')::int > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, result, metadata)
    VALUES (_actor, 'member_lock_denied', 'profiles', _user, 'failed',
            jsonb_build_object('reason', _reason, 'blockers', _blockers));
    RAISE EXCEPTION 'Tài khoản còn trách nhiệm chưa chuyển giao.';
  END IF;

  UPDATE public.profiles
     SET status = 'locked',
         locked_at = now(),
         locked_by = _actor,
         lock_reason = btrim(_reason),
         unlocked_at = NULL,
         unlocked_by = NULL
   WHERE id = _user;

  -- Không nhận thông báo mới: đánh dấu đã đọc các thông báo chưa đọc còn tồn.
  UPDATE public.notifications SET read_at = now() WHERE recipient_id = _user AND read_at IS NULL;
  UPDATE public.telegram_outbox
     SET status = 'failed', last_error = 'Tài khoản đã bị khóa', updated_at = now()
   WHERE target_type = 'user' AND target_id = _user AND status = 'pending';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, result, before_data, after_data, metadata)
  VALUES (_actor, 'member_lock', 'profiles', _user, 'success',
          jsonb_build_object('status', _before),
          jsonb_build_object('status', 'locked'),
          jsonb_build_object('reason', btrim(_reason), 'blockers', _blockers));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4. Khôi phục tài khoản
CREATE OR REPLACE FUNCTION public.member_unlock(_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _before text;
BEGIN
  IF NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Chỉ Admin được khôi phục tài khoản.';
  END IF;

  SELECT status::text INTO _before FROM public.profiles WHERE id = _user;
  IF _before IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản này.';
  END IF;
  IF _before <> 'locked' THEN
    RAISE EXCEPTION 'Tài khoản này không ở trạng thái đã khóa.';
  END IF;

  UPDATE public.profiles
     SET status = 'active', unlocked_at = now(), unlocked_by = _actor
   WHERE id = _user;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, result, before_data, after_data, metadata)
  VALUES (_actor, 'member_unlock', 'profiles', _user, 'success',
          jsonb_build_object('status', _before),
          jsonb_build_object('status', 'active'),
          '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5. Danh sách tài khoản lưu trữ (chỉ Admin)
CREATE OR REPLACE FUNCTION public.member_archived_list()
RETURNS TABLE (
  id uuid,
  display_name text,
  email text,
  job_title text,
  role text,
  team_id uuid,
  team_name text,
  locked_at timestamptz,
  locked_by uuid,
  locked_by_name text,
  lock_reason text,
  phone_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Chỉ Admin được xem tài khoản lưu trữ.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.email, p.job_title,
         (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = p.id LIMIT 1),
         p.primary_team_id, t.name,
         p.locked_at, p.locked_by, a.display_name, p.lock_reason, p.phone_number
    FROM public.profiles p
    LEFT JOIN public.teams t ON t.id = p.primary_team_id
    LEFT JOIN public.profiles a ON a.id = p.locked_by
   WHERE p.status = 'locked'
   ORDER BY p.locked_at DESC NULLS LAST, p.display_name;
END;
$$;

-- 6. Chặn giao trách nhiệm mới cho tài khoản đã khóa
CREATE OR REPLACE FUNCTION public.reject_locked_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target uuid;
BEGIN
  _target := CASE TG_TABLE_NAME
    WHEN 'tasks' THEN NEW.assignee_id
    WHEN 'projects' THEN NEW.owner_id
    WHEN 'teams' THEN NEW.leader_id
    WHEN 'task_participants' THEN NEW.user_id
    WHEN 'team_collaborators' THEN NEW.user_id
  END;

  IF _target IS NOT NULL
     AND (TG_OP = 'INSERT' OR _target IS DISTINCT FROM (
        CASE TG_TABLE_NAME
          WHEN 'tasks' THEN OLD.assignee_id
          WHEN 'projects' THEN OLD.owner_id
          WHEN 'teams' THEN OLD.leader_id
          WHEN 'task_participants' THEN OLD.user_id
          WHEN 'team_collaborators' THEN OLD.user_id
        END))
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _target AND status <> 'active')
  THEN
    RAISE EXCEPTION 'Không thể giao trách nhiệm mới cho tài khoản đã khóa.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_reject_locked ON public.tasks;
CREATE TRIGGER trg_tasks_reject_locked BEFORE INSERT OR UPDATE OF assignee_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_assignment();

DROP TRIGGER IF EXISTS trg_projects_reject_locked ON public.projects;
CREATE TRIGGER trg_projects_reject_locked BEFORE INSERT OR UPDATE OF owner_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_assignment();

DROP TRIGGER IF EXISTS trg_teams_reject_locked ON public.teams;
CREATE TRIGGER trg_teams_reject_locked BEFORE INSERT OR UPDATE OF leader_id ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_assignment();

DROP TRIGGER IF EXISTS trg_task_participants_reject_locked ON public.task_participants;
CREATE TRIGGER trg_task_participants_reject_locked BEFORE INSERT ON public.task_participants
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_assignment();

DROP TRIGGER IF EXISTS trg_team_collaborators_reject_locked ON public.team_collaborators;
CREATE TRIGGER trg_team_collaborators_reject_locked BEFORE INSERT ON public.team_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_assignment();

-- 7. Không gửi thông báo / Telegram mới cho tài khoản đã khóa
CREATE OR REPLACE FUNCTION public.skip_notification_for_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.recipient_id AND status <> 'active') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_skip_locked ON public.notifications;
CREATE TRIGGER trg_notifications_skip_locked BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.skip_notification_for_locked();

CREATE OR REPLACE FUNCTION public.skip_telegram_for_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.target_type = 'user'
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.target_id AND status <> 'active') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_telegram_outbox_skip_locked ON public.telegram_outbox;
CREATE TRIGGER trg_telegram_outbox_skip_locked BEFORE INSERT ON public.telegram_outbox
  FOR EACH ROW EXECUTE FUNCTION public.skip_telegram_for_locked();

-- 8. Quyền thực thi
REVOKE ALL ON FUNCTION public.member_lock_blockers(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_lock(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_unlock(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_archived_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_lock_blockers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_lock(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_unlock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_archived_list() TO authenticated, service_role;
