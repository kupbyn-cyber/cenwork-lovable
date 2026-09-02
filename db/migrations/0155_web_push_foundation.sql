-- CEN-PUSH-P01 — Web Push foundation.
-- Notification Center vẫn là nguồn sự thật; Web Push chỉ là kênh gửi ra.
-- Bảng mới tách theo từng lần gửi (notification × subscription) để chống trùng.

-- 1) Đăng ký thiết bị --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_push_subscriptions_endpoint_key UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx
  ON public.web_push_subscriptions (user_id) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_push_subscriptions TO authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='web_push_subscriptions' AND policyname='web_push_subscriptions_own') THEN
    CREATE POLICY web_push_subscriptions_own
      ON public.web_push_subscriptions FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS web_push_subscriptions_set_updated_at ON public.web_push_subscriptions;
CREATE TRIGGER web_push_subscriptions_set_updated_at
  BEFORE UPDATE ON public.web_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Chuyển dữ liệu từ bảng cũ (NOTIFY-PUSH-01) nếu còn.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='push_subscriptions') THEN
    INSERT INTO public.web_push_subscriptions
      (user_id, endpoint, p256dh, auth, user_agent, is_active, last_success_at, created_at)
    SELECT s.user_id, s.endpoint, s.p256dh, s.auth, s.user_agent, s.enabled, s.last_success_at, s.created_at
    FROM public.push_subscriptions s
    ON CONFLICT (endpoint) DO NOTHING;
  END IF;
END $$;

-- 2) Hàng đợi gửi (mỗi thiết bị một dòng) ------------------------------------
CREATE TABLE IF NOT EXISTS public.web_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.web_push_subscriptions(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  event_type text,
  link text,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT web_push_outbox_delivery_key UNIQUE (notification_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS web_push_outbox_pending_idx
  ON public.web_push_outbox (next_attempt_at) WHERE status = 'pending';

GRANT ALL ON public.web_push_outbox TO service_role;

ALTER TABLE public.web_push_outbox ENABLE ROW LEVEL SECURITY;
-- Không có policy cho authenticated: đây là hàng đợi nội bộ của máy chủ.

-- 3) Classifier: chỉ Task cần hành động + Thông báo bắt buộc cần xác nhận -----
CREATE OR REPLACE FUNCTION public.web_push_is_pushable(_event_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $function$
  SELECT _event_type IN (
    -- A. Task cần user quay lại xử lý
    'task.assigned',
    'task.assignee_changed',
    'task.review_requested',
    'task.approval_requested',
    'task.approval_resubmitted',
    'task.approval_changes_requested',
    'task.mentioned',
    -- B. Thông báo nội bộ bắt buộc cần xác nhận
    'announcement.received',
    'announcement.new_version',
    'announcement.due_24h',
    'announcement.due_2h',
    'announcement.overdue_reminder'
  );
$function$;

GRANT EXECUTE ON FUNCTION public.web_push_is_pushable(text) TO authenticated, service_role;

-- 4) Trigger: xếp hàng best-effort, lỗi không được phá nghiệp vụ -------------
CREATE OR REPLACE FUNCTION public.enqueue_web_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  BEGIN
    IF public.web_push_is_pushable(NEW.event_type) THEN
      INSERT INTO public.web_push_outbox (notification_id, subscription_id, recipient_id, event_type, link)
      SELECT NEW.id, s.id, NEW.recipient_id, NEW.event_type, NEW.link
      FROM public.web_push_subscriptions s
      WHERE s.user_id = NEW.recipient_id AND s.is_active
      ON CONFLICT (notification_id, subscription_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS notifications_enqueue_web_push ON public.notifications;
CREATE TRIGGER notifications_enqueue_web_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_web_push();

-- Trigger cũ (push_outbox theo notification) ngừng hoạt động để không gửi trùng.
DROP TRIGGER IF EXISTS notifications_enqueue_push ON public.notifications;
