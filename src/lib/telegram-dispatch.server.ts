/**
 * CEN WORK — Bộ gửi hàng đợi Telegram (server-only).
 * Dùng chung cho worker tự động (cron) và thao tác thủ công của Admin.
 * Không log Bot Token; lỗi lưu dạng chuỗi đã rút gọn.
 */
import { getAdminClient } from "@/lib/db/admin-client.server";
export const MAX_ATTEMPTS = 5;
export const BATCH_SIZE = 20;

export interface OutboxRow {
  id: string;
  chat_id: string;
  topic_id: string | null;
  message: string;
  attempts: number;
}

/** Lỗi cấu hình (chat/user không tồn tại, bot bị chặn…) → không retry vô hạn. */
export function isPermanentError(error: string): boolean {
  const text = error.toLowerCase();
  return (
    text.includes("chat not found") ||
    text.includes("bot was blocked") ||
    text.includes("user is deactivated") ||
    text.includes("bot can't initiate conversation") ||
    text.includes("kicked") ||
    text.includes("not enough rights") ||
    text.includes("thread not found") ||
    text.includes("chat_id is empty") ||
    text.includes("unauthorized")
  );
}

export async function dispatchOutbox(options: {
  limit?: number;
  actorId?: string | null;
  ids?: string[];
}): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  const { readTelegramConfig, sendTelegramMessage, TELEGRAM_TOKEN_MISSING } = await import(
    "@/lib/telegram.server"
  );
  const supabaseAdmin = await getAdminClient();

  const config = await readTelegramConfig();
  if (!config.botToken) throw new Error(TELEGRAM_TOKEN_MISSING);
  const token = config.botToken;

  let query = supabaseAdmin
    .from("telegram_outbox")
    .select("id,chat_id,topic_id,message,attempts")
    .neq("status", "sent")
    .lt("attempts", MAX_ATTEMPTS);
  query = options.ids?.length
    ? query.in("id", options.ids)
    : query.eq("status", "pending").order("created_at", { ascending: true }).limit(options.limit ?? BATCH_SIZE);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OutboxRow[];

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    // Claim theo attempts: hai worker chạy song song không gửi trùng một bản ghi.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("telegram_outbox")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("attempts", row.attempts)
      .neq("status", "sent")
      .select("id");
    if (claimError || !claimed || claimed.length === 0) {
      skipped += 1;
      continue;
    }

    const chatId = (row.chat_id ?? "").trim();
    const result = chatId
      ? await sendTelegramMessage(token, {
          chatId,
          topicId: row.topic_id,
          message: row.message,
        })
      : ({ ok: false, error: "chat_id is empty" } as const);

    if (result.ok) {
      sent += 1;
      await supabaseAdmin
        .from("telegram_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
          telegram_message_id: result.messageId,
        })
        .eq("id", row.id);
    } else {
      failed += 1;
      // Lỗi tạm thời: giữ pending để lần chạy sau thử lại tới MAX_ATTEMPTS.
      const permanent = isPermanentError(result.error);
      const exhausted = row.attempts + 1 >= MAX_ATTEMPTS;
      await supabaseAdmin
        .from("telegram_outbox")
        .update({
          status: permanent || exhausted ? "failed" : "pending",
          last_error: result.error,
        })
        .eq("id", row.id);
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: options.actorId ?? null,
      action: result.ok ? "telegram.sent" : "telegram.failed",
      entity_type: "telegram_outbox",
      entity_id: row.id,
      result: result.ok ? "success" : "failure",
      metadata: result.ok ? {} : { error: result.error },
    });
  }

  return { processed: rows.length, sent, failed, skipped };
}
