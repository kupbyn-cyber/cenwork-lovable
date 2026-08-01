import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * CEN 1.0 — M5 server function xử lý hàng đợi Telegram.
 * Chỉ Admin được kích hoạt; token và service role chỉ tồn tại phía server.
 */
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

export const dispatchTelegramQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Chỉ Admin được gửi hàng đợi Telegram.");

    const { readBotToken, sendTelegramMessage, TELEGRAM_TOKEN_MISSING } = await import(
      "@/lib/telegram.server"
    );
    const token = readBotToken();
    if (!token) throw new Error(TELEGRAM_TOKEN_MISSING);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: candidates, error: listError } = await supabaseAdmin
      .from("telegram_outbox")
      .select("id,chat_id,topic_id,message,status,attempts")
      .neq("status", "sent")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (listError) throw new Error(listError.message);

    let sent = 0;
    let failed = 0;

    for (const row of candidates ?? []) {
      // Đánh dấu đã thử trước khi gửi để không gửi trùng khi có lỗi giữa chừng.
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("telegram_outbox")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id)
        .eq("attempts", row.attempts)
        .neq("status", "sent")
        .select("id");
      if (claimError || !claimed || claimed.length === 0) continue;

      const result = await sendTelegramMessage(token, {
        chatId: row.chat_id,
        topicId: row.topic_id,
        message: row.message,
      });

      if (result.ok) {
        sent += 1;
        await supabaseAdmin
          .from("telegram_outbox")
          .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
          .eq("id", row.id);
      } else {
        failed += 1;
        await supabaseAdmin
          .from("telegram_outbox")
          .update({ status: "failed", last_error: result.error })
          .eq("id", row.id);
      }

      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: result.ok ? "telegram.sent" : "telegram.failed",
        entity_type: "telegram_outbox",
        entity_id: row.id,
        result: result.ok ? "success" : "failure",
        metadata: result.ok ? {} : { error: result.error },
      });
    }

    return { processed: (candidates ?? []).length, sent, failed };
  });
