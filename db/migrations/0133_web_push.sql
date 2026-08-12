-- NOTIFY-PUSH-01 — Web Push (Windows/macOS) như một KÊNH GỬI THÊM của notification hiện có.
-- Không đổi nghiệp vụ notification: bảng notifications giữ nguyên, Notification Center và
-- Telegram không đổi. Trigger chỉ sao chép nội dung sang hàng đợi push_outbox.

-- 1) Đăng ký thiết bị (mỗi browser/device một endpoint).
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  enabled boolean NOT NULL DEFAULT true,
  last_error text,
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id) WHERE enabled;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='push_subscriptions' AND policyname='push_subscriptions_own') THEN
    CREATE POLICY push_subscriptions_own
      ON public.push_subscriptions FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS push_subscriptions_set_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_set_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Hàng đợi gửi push (chỉ tiến trình máy chủ đọc/ghi).
CREATE TABLE IF NOT EXISTS public.push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  event_type text,
  title text,
  body text,
  link text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT push_outbox_notification_key UNIQUE (notification_id)
);

CREATE INDEX IF NOT EXISTS push_outbox_pending_idx
  ON public.push_outbox (created_at) WHERE status = 'pending';

GRANT ALL ON public.push_outbox TO service_role;

ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
-- Không có policy cho authenticated: người dùng thường không đọc hàng đợi này.

-- 3) Trigger: notification hợp lệ nào cũng được xếp hàng push cho đúng recipient.
--    Lỗi ở đây tuyệt đối không được làm hỏng việc tạo notification chính.
CREATE OR REPLACE FUNCTION public.enqueue_push_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  BEGIN
    INSERT INTO public.push_outbox (notification_id, recipient_id, event_type, title, body, link)
    VALUES (NEW.id, NEW.recipient_id, NEW.event_type, NEW.title, NEW.body, NEW.link)
    ON CONFLICT (notification_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS notifications_enqueue_push ON public.notifications;
CREATE TRIGGER notifications_enqueue_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_notification();
