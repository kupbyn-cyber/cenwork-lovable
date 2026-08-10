-- 1) account_status: bổ sung trạng thái "Đã nghỉ"
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'resigned';

-- 2) enum cho thông báo nội bộ
DO $$ BEGIN
  CREATE TYPE public.announcement_status AS ENUM ('draft','published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.announcement_recipient_status AS ENUM ('unread','reading','completed','exempt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.announcement_target_type AS ENUM ('user','team');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) bảng
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status public.announcement_status NOT NULL DEFAULT 'draft',
  due_at timestamptz,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcement_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  target_type public.announcement_target_type NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS public.announcement_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  status public.announcement_recipient_status NOT NULL DEFAULT 'unread',
  due_at timestamptz NOT NULL,
  first_opened_at timestamptz,
  read_completed_at timestamptz,
  acknowledged_at timestamptz,
  is_late boolean NOT NULL DEFAULT false,
  exempt_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ann_recipients_user ON public.announcement_recipients(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ann_recipients_ann ON public.announcement_recipients(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcements_creator ON public.announcements(created_by, status);

GRANT SELECT, INSERT, UPDATE ON public.announcements TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.announcement_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.announcement_recipients TO authenticated;
GRANT ALL ON public.announcements TO service_role;
GRANT ALL ON public.announcement_targets TO service_role;
GRANT ALL ON public.announcement_recipients TO service_role;

-- 4) hàm phạm vi gửi
CREATE OR REPLACE FUNCTION public.can_announce_to_user(_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    _target = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'cmo')
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = _target AND p.primary_team_id IN (SELECT public.my_team_ids()))
    OR EXISTS (SELECT 1 FROM public.team_collaborators tc
               WHERE tc.user_id = _target AND tc.team_id IN (SELECT public.my_team_ids()))
    OR EXISTS (SELECT 1 FROM public.projects pr
               WHERE (pr.owner_id = auth.uid() OR pr.created_by = auth.uid())
                 AND public.is_in_project_scope(pr.id, _target))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_announce_to_team(_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'cmo')
    OR _team IN (SELECT public.my_team_ids())
  );
$$;

-- 5) nghĩa vụ quá hạn (tính động, không dùng cờ trên user)
CREATE OR REPLACE FUNCTION public.has_overdue_announcement(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_recipients r
    JOIN public.announcements a ON a.id = r.announcement_id
    WHERE r.user_id = _user
      AND r.status IN ('unread','reading')
      AND a.status = 'published'
      AND a.deleted_at IS NULL
      AND r.due_at < now()
  );
$$;

REVOKE ALL ON FUNCTION public.can_announce_to_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_announce_to_team(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_overdue_announcement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_announce_to_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_announce_to_team(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_overdue_announcement(uuid) TO authenticated, service_role;

-- 6) RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ann_select" ON public.announcements FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    created_by = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'cmo')
    OR EXISTS (SELECT 1 FROM public.announcement_recipients r
               WHERE r.announcement_id = announcements.id AND r.user_id = auth.uid())
  )
);

CREATE POLICY "ann_insert" ON public.announcements FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND status = 'draft' AND deleted_at IS NULL);

CREATE POLICY "ann_update" ON public.announcements FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "ann_targets_select" ON public.announcement_targets FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.announcements a
               WHERE a.id = announcement_id
                 AND (a.created_by = auth.uid() OR public.has_role(auth.uid(),'admin')
                      OR public.has_role(auth.uid(),'cmo'))));

CREATE POLICY "ann_targets_insert" ON public.announcement_targets FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.announcements a
          WHERE a.id = announcement_id AND a.created_by = auth.uid() AND a.status = 'draft')
  AND CASE WHEN target_type = 'user' THEN public.can_announce_to_user(target_id)
           ELSE public.can_announce_to_team(target_id) END
);

CREATE POLICY "ann_targets_delete" ON public.announcement_targets FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.announcements a
               WHERE a.id = announcement_id AND a.created_by = auth.uid() AND a.status = 'draft'));

CREATE POLICY "ann_recipients_select" ON public.announcement_recipients FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'cmo')
  OR EXISTS (SELECT 1 FROM public.announcements a
             WHERE a.id = announcement_id AND a.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = user_id AND p.primary_team_id IS NOT NULL
               AND p.primary_team_id = public.leader_team_id(auth.uid()))
);

CREATE POLICY "ann_recipients_insert" ON public.announcement_recipients FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.announcements a
          WHERE a.id = announcement_id AND a.created_by = auth.uid())
  AND public.can_announce_to_user(user_id)
);

CREATE POLICY "ann_recipients_update" ON public.announcement_recipients FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 7) validate
CREATE OR REPLACE FUNCTION public.validate_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by <> OLD.created_by THEN
      RAISE EXCEPTION 'Không được đổi người tạo thông báo';
    END IF;
    IF OLD.status = 'published' AND (
         NEW.title <> OLD.title OR NEW.body <> OLD.body
         OR NEW.due_at IS DISTINCT FROM OLD.due_at OR NEW.status <> OLD.status
         OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
      RAISE EXCEPTION 'Thông báo đã phát hành, không thể sửa hoặc xóa';
    END IF;
    IF NEW.status = 'published' AND OLD.status = 'draft' THEN
      IF COALESCE(btrim(NEW.title),'') = '' OR COALESCE(btrim(NEW.body),'') = '' THEN
        RAISE EXCEPTION 'Phải nhập tiêu đề và nội dung trước khi phát hành';
      END IF;
      IF NEW.due_at IS NULL OR NEW.due_at <= now() THEN
        RAISE EXCEPTION 'Hạn xác nhận phải ở tương lai';
      END IF;
      NEW.published_at := now();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_announcement BEFORE INSERT OR UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.validate_announcement();

CREATE OR REPLACE FUNCTION public.validate_announcement_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.announcement_id <> OLD.announcement_id OR NEW.user_id <> OLD.user_id THEN
      RAISE EXCEPTION 'Không được đổi thông báo hoặc người nhận';
    END IF;
    IF OLD.status IN ('completed','exempt') THEN
      RAISE EXCEPTION 'Thông báo này đã được xử lý';
    END IF;
    NEW.due_at := OLD.due_at;
    NEW.exempt_reason := OLD.exempt_reason;
    IF NEW.first_opened_at IS NULL THEN NEW.first_opened_at := OLD.first_opened_at; END IF;
    IF OLD.first_opened_at IS NOT NULL THEN NEW.first_opened_at := OLD.first_opened_at; END IF;
    IF OLD.read_completed_at IS NOT NULL THEN NEW.read_completed_at := OLD.read_completed_at; END IF;

    IF NEW.status = 'completed' THEN
      IF NEW.read_completed_at IS NULL THEN
        RAISE EXCEPTION 'Phải đọc hết nội dung trước khi xác nhận';
      END IF;
      NEW.acknowledged_at := now();
      NEW.is_late := now() > OLD.due_at;
    ELSIF NEW.status = 'exempt' THEN
      RAISE EXCEPTION 'Chỉ hệ thống mới chuyển sang Miễn hoàn thành';
    ELSE
      NEW.acknowledged_at := NULL;
      NEW.is_late := false;
      IF NEW.first_opened_at IS NOT NULL THEN NEW.status := 'reading'; END IF;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_announcement_recipient
BEFORE INSERT OR UPDATE ON public.announcement_recipients
FOR EACH ROW EXECUTE FUNCTION public.validate_announcement_recipient();

-- 8) audit
CREATE OR REPLACE FUNCTION public.audit_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('announcement.draft_created','announcement',NEW.id,NULL,
      jsonb_build_object('title',NEW.title), '{}'::jsonb);
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    PERFORM public.write_audit('announcement.draft_deleted','announcement',NEW.id,
      jsonb_build_object('title',OLD.title), NULL, '{}'::jsonb);
  ELSIF NEW.status = 'published' AND OLD.status = 'draft' THEN
    PERFORM public.write_audit('announcement.published','announcement',NEW.id,NULL,
      jsonb_build_object('title',NEW.title,'due_at',NEW.due_at), '{}'::jsonb);
  ELSE
    PERFORM public.write_audit('announcement.draft_updated','announcement',NEW.id,
      jsonb_build_object('title',OLD.title), jsonb_build_object('title',NEW.title), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_audit_announcement AFTER INSERT OR UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.audit_announcement();

CREATE OR REPLACE FUNCTION public.audit_announcement_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.write_audit('announcement.acknowledged','announcement',NEW.announcement_id,NULL,
      jsonb_build_object('user_id',NEW.user_id,'is_late',NEW.is_late), '{}'::jsonb);
  ELSIF NEW.status = 'exempt' AND OLD.status IS DISTINCT FROM 'exempt' THEN
    PERFORM public.write_audit('announcement.exempted','announcement',NEW.announcement_id,NULL,
      jsonb_build_object('user_id',NEW.user_id,'reason',NEW.exempt_reason), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_audit_announcement_recipient AFTER UPDATE ON public.announcement_recipients
FOR EACH ROW EXECUTE FUNCTION public.audit_announcement_recipient();

-- 9) user "Đã nghỉ" -> miễn hoàn thành
CREATE OR REPLACE FUNCTION public.exempt_resigned_recipients()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text = 'resigned' AND OLD.status::text <> 'resigned' THEN
    UPDATE public.announcement_recipients
       SET status = 'exempt', exempt_reason = 'Tài khoản đã nghỉ', updated_at = now()
     WHERE user_id = NEW.id AND status IN ('unread','reading');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_exempt_resigned_recipients AFTER UPDATE OF status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.exempt_resigned_recipients();

-- 10) khóa thao tác nghiệp vụ khi còn thông báo quá hạn
CREATE OR REPLACE FUNCTION public.enforce_no_overdue_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_overdue_announcement(auth.uid()) THEN
    RAISE EXCEPTION 'Bạn đang bị giới hạn thao tác vì còn thông báo nội bộ quá hạn chưa xác nhận';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects','project_teams','project_members','project_facilities',
    'tasks','task_participants','daily_reports','weekly_reports',
    'teams','team_collaborators','facilities',
    'mvp_cycles','mvp_manual_reviews','mvp_votes','mvp_award_results','mvp_cycle_tasks',
    'announcements','announcement_targets'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_block_overdue_%1$s BEFORE INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.enforce_no_overdue_announcement()', t);
  END LOOP;
END $$;
