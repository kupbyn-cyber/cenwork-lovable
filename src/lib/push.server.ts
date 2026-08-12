/**
 * CEN WORK — NOTIFY-PUSH-01: gửi Web Push (server-only).
 *
 * Web Push chỉ là KÊNH GỬI THÊM cho notification đã tồn tại trong bảng
 * notifications. Không sinh notification nghiệp vụ mới, không đổi recipient.
 * VAPID private key chỉ đọc từ biến môi trường phía máy chủ.
 */
import { getAdminClient } from "@/lib/db/admin-client.server";
import { notificationEventLabel } from "@/lib/notification-labels";

export const BATCH_SIZE = 25;
export const MAX_ATTEMPTS = 3;

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface OutboxRow {
  id: string;
  notification_id: string;
  recipient_id: string;
  event_type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  attempts: number;
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
  const subject = (process.env["VAPID_SUBJECT"] ?? "").trim() || "mailto:admin@cenwork.tudogroup.vn";
  return { publicKey, privateKey, subject };
}

function baseUrl(): string {
  return ((process.env["CEN_APP_BASE_URL"] ?? "https://cenwork.tudogroup.vn").trim() || "/").replace(/\/+$/, "");
}

function absoluteLink(link: string | null): string {
  const value = (link ?? "").trim();
  if (!value) return `${baseUrl()}/`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${baseUrl()}/${value.replace(/^\/+/, "")}`;
}

function payloadFor(row: OutboxRow): string {
  return JSON.stringify({
    notificationId: row.notification_id,
    category: notificationEventLabel(row.event_type ?? ""),
    title: (row.title ?? "").trim(),
    body: (row.body ?? "").trim(),
    url: absoluteLink(row.link),
  });
}

/** Endpoint hết hạn/không còn tồn tại → tắt subscription, không retry mãi. */
function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
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
    .from("push_outbox")
    .select("id,notification_id,recipient_id,event_type,title,body,link,attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(options.limit ?? BATCH_SIZE);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OutboxRow[];
  if (rows.length === 0) return result;

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  for (const row of rows) {
    result.processed += 1;

    // Claim theo attempts: nhiều tiến trình chạy song song không gửi trùng.
    const { data: claimed } = await db
      .from("push_outbox")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("attempts", row.attempts)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) {
      result.skipped += 1;
      continue;
    }

    // Chỉ gửi tới đúng recipient của notification.
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", row.recipient_id)
      .eq("enabled", true);
    const subscriptions = (subs ?? []) as SubscriptionRow[];

    if (subscriptions.length === 0) {
      result.skipped += 1;
      await db
        .from("push_outbox")
        .update({ status: "skipped", sent_at: new Date().toISOString(), last_error: "no_subscription" })
        .eq("id", row.id);
      continue;
    }

    const payload = payloadFor(row);
    let delivered = 0;
    let lastError: string | null = null;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 3600 },
        );
        delivered += 1;
        await db
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), last_error: null })
          .eq("id", sub.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        lastError = `${status ?? ""} ${(error as Error).message}`.trim().slice(0, 400);
        if (isGoneStatus(status)) {
          await db
            .from("push_subscriptions")
            .update({ enabled: false, last_error: "endpoint_gone" })
            .eq("id", sub.id);
        } else {
          await db.from("push_subscriptions").update({ last_error: lastError }).eq("id", sub.id);
        }
      }
    }

    if (delivered > 0) {
      result.sent += 1;
      await db
        .from("push_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
    } else {
      result.failed += 1;
      await db
        .from("push_outbox")
        .update({
          status: row.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
          last_error: lastError ?? "unknown_error",
        })
        .eq("id", row.id);
    }
  }

  return result;
}
