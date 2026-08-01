-- ============ 1. MỞ RỘNG BẢNG ANNOUNCEMENTS ============
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS result_visibility text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS last_minor_edit_at timestamptz;

ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_result_visibility_check
  CHECK (result_visibility IN ('none','after_submit','after_due'));

ALTER TABLE public.announcement_recipients
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- ============ 2. HÀM TRỢ GIÚP ============
CREATE OR REPLACE FUNCTION public.announcement_is_active(_a uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.announcements a
                 WHERE a.id = _a AND a.status = 'published'
                   AND a.deleted_at IS NULL AND a.revoked_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.can_view_announcement(_a uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'cmo')
    OR public.announcement_author(_a) = auth.uid()
    OR public.is_announcement_recipient(_a, auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_announcement(_a uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'cmo')
    OR public.announcement_author(_a) = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_announcement()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cmo');
$$;

CREATE OR REPLACE FUNCTION public.announcement_comments_open(_a uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.announcement_is_active(_a)
     AND COALESCE((SELECT comments_enabled FROM public.announcements WHERE id = _a), false);
$$;

CREATE OR REPLACE FUNCTION public.announcement_current_version(_a uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT current_version FROM public.announcements WHERE id = _a), 1);
$$;

-- thu hồi thì không còn gây khóa thao tác
CREATE OR REPLACE FUNCTION public.has_overdue_announcement(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_recipients r
    JOIN public.announcements a ON a.id = r.announcement_id
    WHERE r.user_id = _user
      AND r.status IN ('unread','reading')
      AND a.status = 'published'
      AND a.deleted_at IS NULL
      AND a.revoked_at IS NULL
      AND r.due_at < now()
  );
$$;

-- ============ 3. PHIÊN BẢN VÀ CHỈNH SỬA NHỎ ============
CREATE TABLE public.announcement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  due_at timestamptz,
  comments_enabled boolean NOT NULL DEFAULT true,
  result_visibility text NOT NULL DEFAULT 'none',
  reason text,
  change_summary text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, version)
);
GRANT SELECT, INSERT ON public.announcement_versions TO authenticated;
GRANT ALL ON public.announcement_versions TO service_role;
ALTER TABLE public.announcement_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "av_select" ON public.announcement_versions FOR SELECT TO authenticated
  USING (public.can_view_announcement(announcement_id));
CREATE POLICY "av_insert" ON public.announcement_versions FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_announcement(announcement_id));

CREATE TABLE public.announcement_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  version integer NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcement_revisions TO authenticated;
GRANT ALL ON public.announcement_revisions TO service_role;
ALTER TABLE public.announcement_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ar_select" ON public.announcement_revisions FOR SELECT TO authenticated
  USING (public.can_view_announcement(announcement_id));

CREATE TABLE public.announcement_recipient_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  version integer NOT NULL,
  status announcement_recipient_status NOT NULL,
  due_at timestamptz NOT NULL,
  first_opened_at timestamptz,
  read_completed_at timestamptz,
  acknowledged_at timestamptz,
  is_late boolean NOT NULL DEFAULT false,
  exempt_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id, version)
);
GRANT SELECT ON public.announcement_recipient_history TO authenticated;
GRANT ALL ON public.announcement_recipient_history TO service_role;
ALTER TABLE public.announcement_recipient_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arh_select" ON public.announcement_recipient_history FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_edit_announcement(announcement_id));

-- ============ 4. BÌNH LUẬN ============
CREATE TABLE public.announcement_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.announcement_comments(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL,
  is_edited boolean NOT NULL DEFAULT false,
  hidden_at timestamptz,
  hidden_by uuid REFERENCES public.profiles(id),
  hidden_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ann_comments_announcement ON public.announcement_comments(announcement_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.announcement_comments TO authenticated;
GRANT ALL ON public.announcement_comments TO service_role;
ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ac_select" ON public.announcement_comments FOR SELECT TO authenticated
  USING (public.can_view_announcement(announcement_id));
CREATE POLICY "ac_insert" ON public.announcement_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid()
              AND public.can_view_announcement(announcement_id)
              AND public.announcement_comments_open(announcement_id));
CREATE POLICY "ac_update" ON public.announcement_comments FOR UPDATE TO authenticated
  USING ((author_id = auth.uid() AND hidden_at IS NULL) OR public.can_moderate_announcement())
  WITH CHECK ((author_id = auth.uid()) OR public.can_moderate_announcement());

CREATE TABLE public.announcement_comment_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.announcement_comments(id) ON DELETE CASCADE,
  previous_body text NOT NULL,
  edited_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcement_comment_edits TO authenticated;
GRANT ALL ON public.announcement_comment_edits TO service_role;
ALTER TABLE public.announcement_comment_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace_select" ON public.announcement_comment_edits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.announcement_comments c
                 WHERE c.id = comment_id AND public.can_view_announcement(c.announcement_id)));

CREATE TABLE public.announcement_comment_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.announcement_comments(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);
GRANT SELECT, INSERT ON public.announcement_comment_mentions TO authenticated;
GRANT ALL ON public.announcement_comment_mentions TO service_role;
ALTER TABLE public.announcement_comment_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acm_select" ON public.announcement_comment_mentions FOR SELECT TO authenticated
  USING (public.can_view_announcement(announcement_id));
-- chỉ được nhắc tên người vẫn còn quyền xem thông báo
CREATE POLICY "acm_insert" ON public.announcement_comment_mentions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_view_announcement(announcement_id)
    AND EXISTS (SELECT 1 FROM public.announcement_comments c
                WHERE c.id = comment_id AND c.author_id = auth.uid()
                  AND c.announcement_id = announcement_comment_mentions.announcement_id)
    AND (
      public.is_announcement_recipient(announcement_id, user_id)
      OR public.announcement_author(announcement_id) = user_id
      OR EXISTS (SELECT 1 FROM public.announcement_comments c2
                 WHERE c2.announcement_id = announcement_comment_mentions.announcement_id
                   AND c2.author_id = announcement_comment_mentions.user_id)
    )
  );

-- ============ 5. KHẢO SÁT ============
CREATE TABLE public.announcement_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  position integer NOT NULL DEFAULT 0,
  question_type text NOT NULL CHECK (question_type IN ('single','multi','short')),
  content text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  min_select integer,
  max_select integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ann_questions ON public.announcement_questions(announcement_id, version, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_questions TO authenticated;
GRANT ALL ON public.announcement_questions TO service_role;
ALTER TABLE public.announcement_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aq_select" ON public.announcement_questions FOR SELECT TO authenticated
  USING (public.can_view_announcement(announcement_id));
CREATE POLICY "aq_write" ON public.announcement_questions FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_announcement(announcement_id));
CREATE POLICY "aq_update" ON public.announcement_questions FOR UPDATE TO authenticated
  USING (public.can_edit_announcement(announcement_id))
  WITH CHECK (public.can_edit_announcement(announcement_id));
-- chỉ xoá được câu hỏi của bản Nháp chưa phát hành
CREATE POLICY "aq_delete" ON public.announcement_questions FOR DELETE TO authenticated
  USING (public.can_edit_announcement(announcement_id)
         AND EXISTS (SELECT 1 FROM public.announcements a
                     WHERE a.id = announcement_id AND a.status = 'draft'));

CREATE TABLE public.announcement_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.announcement_questions(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ann_options ON public.announcement_question_options(question_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_question_options TO authenticated;
GRANT ALL ON public.announcement_question_options TO service_role;
ALTER TABLE public.announcement_question_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aqo_select" ON public.announcement_question_options FOR SELECT TO authenticated
  USING (public.can_view_announcement(announcement_id));
CREATE POLICY "aqo_insert" ON public.announcement_question_options FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_announcement(announcement_id));
CREATE POLICY "aqo_update" ON public.announcement_question_options FOR UPDATE TO authenticated
  USING (public.can_edit_announcement(announcement_id))
  WITH CHECK (public.can_edit_announcement(announcement_id));
CREATE POLICY "aqo_delete" ON public.announcement_question_options FOR DELETE TO authenticated
  USING (public.can_edit_announcement(announcement_id)
         AND EXISTS (SELECT 1 FROM public.announcements a
                     WHERE a.id = announcement_id AND a.status = 'draft'));

CREATE TABLE public.announcement_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.announcement_questions(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  option_ids uuid[] NOT NULL DEFAULT '{}',
  text_answer text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id, version)
);
CREATE INDEX idx_ann_answers ON public.announcement_answers(announcement_id, version);
GRANT SELECT, INSERT, UPDATE ON public.announcement_answers TO authenticated;
GRANT ALL ON public.announcement_answers TO service_role;
ALTER TABLE public.announcement_answers ENABLE ROW LEVEL SECURITY;
-- người nhận chỉ xem câu trả lời của chính mình; người phát hành, Admin, CMO xem toàn bộ
CREATE POLICY "aa_select" ON public.announcement_answers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_edit_announcement(announcement_id));
CREATE POLICY "aa_insert" ON public.announcement_answers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
              AND public.announcement_is_active(announcement_id)
              AND public.is_announcement_recipient(announcement_id, auth.uid()));
CREATE POLICY "aa_update" ON public.announcement_answers FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND submitted_at IS NULL
         AND public.announcement_is_active(announcement_id))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.announcement_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('due_24h','due_2h')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id, version, kind)
);
GRANT SELECT ON public.announcement_reminders TO authenticated;
GRANT ALL ON public.announcement_reminders TO service_role;
ALTER TABLE public.announcement_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arm_select" ON public.announcement_reminders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_edit_announcement(announcement_id));

-- ============ 6. TRIGGER updated_at ============
CREATE TRIGGER trg_ann_comments_updated BEFORE UPDATE ON public.announcement_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ann_questions_updated BEFORE UPDATE ON public.announcement_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ann_answers_updated BEFORE UPDATE ON public.announcement_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 7. TRIGGER BÌNH LUẬN: LỊCH SỬ, AUDIT, THÔNG BÁO ============
CREATE OR REPLACE FUNCTION public.handle_comment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _parent_author uuid; _title text;
BEGIN
  SELECT title INTO _title FROM public.announcements WHERE id = NEW.announcement_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit('announcement.comment_created','announcement',NEW.announcement_id,
      NULL, jsonb_build_object('comment_id',NEW.id,'parent_id',NEW.parent_id), '{}'::jsonb);
    IF NEW.parent_id IS NOT NULL THEN
      SELECT author_id INTO _parent_author FROM public.announcement_comments WHERE id = NEW.parent_id;
      PERFORM public.notify_user(_parent_author,'announcement.comment_replied',
        'Có trả lời bình luận của bạn', COALESCE(_title,'Thông báo nội bộ'),
        'announcement', NEW.announcement_id, '/announcements/' || NEW.announcement_id::text,
        'announcement.reply:' || NEW.id::text);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.body IS DISTINCT FROM OLD.body THEN
    INSERT INTO public.announcement_comment_edits (comment_id, previous_body, edited_by)
    VALUES (OLD.id, OLD.body, auth.uid());
    NEW.is_edited := true;
    PERFORM public.write_audit('announcement.comment_edited','announcement',NEW.announcement_id,
      jsonb_build_object('comment_id',NEW.id), jsonb_build_object('comment_id',NEW.id), '{}'::jsonb);
  END IF;

  IF NEW.hidden_at IS DISTINCT FROM OLD.hidden_at THEN
    IF NEW.hidden_at IS NOT NULL AND COALESCE(btrim(NEW.hidden_reason),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập lý do khi ẩn bình luận';
    END IF;
    NEW.hidden_by := auth.uid();
    PERFORM public.write_audit(
      CASE WHEN NEW.hidden_at IS NULL THEN 'announcement.comment_unhidden'
           ELSE 'announcement.comment_hidden' END,
      'announcement', NEW.announcement_id, NULL,
      jsonb_build_object('comment_id',NEW.id,'reason',NEW.hidden_reason), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ann_comment_change
  BEFORE INSERT OR UPDATE ON public.announcement_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_change();

CREATE OR REPLACE FUNCTION public.notify_comment_mention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _title text;
BEGIN
  SELECT title INTO _title FROM public.announcements WHERE id = NEW.announcement_id;
  PERFORM public.notify_user(NEW.user_id,'announcement.mentioned','Bạn được nhắc tên trong bình luận',
    COALESCE(_title,'Thông báo nội bộ'), 'announcement', NEW.announcement_id,
    '/announcements/' || NEW.announcement_id::text, 'announcement.mention:' || NEW.id::text);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ann_mention_notify
  AFTER INSERT ON public.announcement_comment_mentions
  FOR EACH ROW EXECUTE FUNCTION public.notify_comment_mention();

-- ============ 8. THÔNG BÁO KHI CÓ NGƯỜI NHẬN MỚI (PHÁT HÀNH) ============
CREATE OR REPLACE FUNCTION public.notify_new_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _title text;
BEGIN
  IF NEW.status = 'exempt' THEN RETURN NEW; END IF;
  SELECT title INTO _title FROM public.announcements WHERE id = NEW.announcement_id;
  PERFORM public.notify_user(NEW.user_id,'announcement.received','Bạn có thông báo nội bộ mới',
    COALESCE(_title,'Thông báo nội bộ'), 'announcement', NEW.announcement_id,
    '/announcements/' || NEW.announcement_id::text,
    'announcement.received:' || NEW.announcement_id::text || ':v' || NEW.version::text);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ann_recipient_notify
  AFTER INSERT ON public.announcement_recipients
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_recipient();