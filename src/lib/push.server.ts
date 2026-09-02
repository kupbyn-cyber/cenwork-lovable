/**
 * CEN-PUSH-P01 — gửi Web Push (server-only).
 *
 * Web Push chỉ là kênh gửi ra của Notification Center: không sinh sự kiện
 * nghiệp vụ mới, không đổi recipient, lỗi gửi không làm hỏng nghiệp vụ.
 * VAPID private key chỉ đọc từ biến môi trường phía máy chủ, không log.
 */
import { getAdminClient } from "@/lib/db/admin-client.server";

export const BATCH_SIZE = 25;
export const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = [1, 5, 15];

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

interface OutboxRow {
  id: string;
  notification_id: string;
  subscription_id: string;
  event_type: string | null;
  link: string | null;
  attempt_count: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from: (table: string) => any };

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function readVapidConfig(): VapidConfig | null {
  const publicKey = (process.env["VAPID_PUBLIC_KEY"] ?? "").trim();
  const privateKey = (process.env["VAPID_PRIVATE_KEY"] ?? "").trim();
  if (!publicKey || !privateKey) return null;
  const subject =
    (process.env["VAPID_SUBJECT"] ?? "").trim() || "mailto:admin@cenwork.tudogroup.vn";
  return { publicKey, privateKey, subject };
}

/** Chỉ cho phép đường dẫn nội bộ; chặn http://, https://, //host. */
export function safeInternalPath(link: string | null | undefined): string {
  const value = (link ?? "").trim();
  if (!value) return "/notifications";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "/notifications";
  if (value.startsWith("//")) return "/notifications";
  if (!value.startsWith("/")) return `/${value}`;
  return value;
}

/** Nội dung chung chung: push có thể hiện trên màn hình khóa/màn hình chung. */
export function genericPayload(row: OutboxRow): string {
  const isAnnouncement = (row.event_type ?? "").startsWith("announcement.");
  return JSON.stringify({
    notificationId: row.notification_id,
    category: isAnnouncement ? "announcement" : "task",
    title: isAnnouncement ? "CEN — Thông báo mới" : "CEN — Công việc cần xử lý",
    body: isAnnouncement
      ? "Bạn có thông báo cần xác nhận."
      : "Bạn có nội dung mới cần xem trong CEN.",
    internalPath: safeInternalPath(row.link),
    tag: row.notification_id,
  });
}

function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

function nextAttemptAt(attempt: number): string {
  const minutes = RETRY_BACKOFF_MINUTES[Math.min(attempt, RETRY_BACKOFF_MINUTES.length - 1)] ?? 15;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function dispatchPushOutbox(options: { limit?: number } = {}): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const result = { processed: 0, sent: 0, skipped: 0, failed: 0 };
  const vapid = readVapidConfig();
  if (!vapid) return result;

  const db = (await getAdminClient()) as unknown as AnyDb;
  const { data, error } = await db
    .from("web_push_outbox")
    .select("id,notification_id,subscription_id,event_type,link,attempt_count")
    .eq("status", "pending")
    .lt("attempt_count", MAX_ATTEMPTS)
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(options.limit ?? BATCH_SIZE);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OutboxRow[];
  if (rows.length === 0) return result;

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  for (const row of rows) {
    result.processed += 1;

    // Claim theo attempt_count: nhiều tiến trình song song không gửi trùng,
    // và một delivery đã 'sent' thì không bao giờ gửi lại.
    const { data: claimed } = await db
      .from("web_push_outbox")
      .update({ attempt_count: row.attempt_count + 1 })
      .eq("id", row.id)
      .eq("attempt_count", row.attempt_count)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) {
      result.skipped += 1;
      continue;
    }

    const { data: subs } = await db
      .from("web_push_subscriptions")
      .select("id,endpoint,p256dh,auth,failure_count")
      .eq("id", row.subscription_id)
      .eq("is_active", true)
      .limit(1);
    const sub = ((subs ?? []) as SubscriptionRow[])[0];

    if (!sub) {
      result.skipped += 1;
      await db
        .from("web_push_outbox")
        .update({
          status: "skipped",
          sent_at: new Date().toISOString(),
          last_error: "no_active_subscription",
        })
        .eq("id", row.id);
      continue;
    }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        genericPayload(row),
        { TTL: 3600 },
      );
      result.sent += 1;
      await db
        .from("web_push_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      await db
        .from("web_push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", sub.id);
    } catch (err) {
      result.failed += 1;
      const status = (err as { statusCode?: number }).statusCode;
      // Không log key/endpoint: chỉ mã lỗi và mô tả ngắn.
      const lastError = `${status ?? ""} ${(err as Error).message}`.trim().slice(0, 300);
      const gone = isGoneStatus(status);

      await db
        .from("web_push_subscriptions")
        .update({
          failure_count: (sub.failure_count ?? 0) + 1,
          last_failure_at: new Date().toISOString(),
          ...(gone ? { is_active: false } : {}),
        })
        .eq("id", sub.id);

      const exhausted = gone || row.attempt_count + 1 >= MAX_ATTEMPTS;
      await db
        .from("web_push_outbox")
        .update({
          status: exhausted ? "failed" : "pending",
          next_attempt_at: nextAttemptAt(row.attempt_count),
          last_error: gone ? "endpoint_gone" : lastError,
        })
        .eq("id", row.id);
    }
  }

  return result;
}
