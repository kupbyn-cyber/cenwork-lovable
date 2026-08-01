import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * CEN WORK — M5 server function cấu hình và vận hành Telegram.
 * Chỉ Admin được cấu hình và kích hoạt; Bot Token và service role chỉ tồn tại phía server.
 */
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data: isAdmin, error } = await (context.supabase.rpc as any)("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error((error as { message: string }).message);
  if (!isAdmin) throw new Error("Chỉ Admin được quản trị Telegram.");
}

export const getTelegramConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { readTelegramConfig, maskToken } = await import("@/lib/telegram.server");
    const config = await readTelegramConfig();
    return {
      groupChatId: config.groupChatId,
      botConfigured: Boolean(config.botToken),
      botTokenMasked: maskToken(config.botToken),
    };
  });

export const saveTelegramConfig = createServerFn({ method: "POST" })
  .inputValidator((input: { botToken?: string | null; groupChatId: string }) => {
    const groupChatId = input.groupChatId.trim();
    if (!/^-?\d{5,20}$/.test(groupChatId)) {
      throw new Error("Group Chat ID phải là dãy số hợp lệ, ví dụ -1002041537249.");
    }
    const botToken =
      typeof input.botToken === "string" ? input.botToken.trim() : (input.botToken ?? undefined);
    if (typeof botToken === "string" && botToken && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
      throw new Error("Bot Token không đúng định dạng của Telegram.");
    }
    return { groupChatId, botToken };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: Record<string, unknown> = {
      id: true,
      group_chat_id: data.groupChatId,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    // Chỉ ghi đè token khi Admin nhập giá trị mới; chuỗi rỗng = xóa token.
    if (typeof data.botToken === "string") {
      payload["bot_token"] = data.botToken ? data.botToken : null;
    }

    const { error } = await supabaseAdmin
      .from("telegram_config")
      .upsert(payload as never, { onConflict: "id" });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "telegram.config_updated",
      entity_type: "telegram_config",
      result: "success",
      metadata: {
        group_chat_id: data.groupChatId,
        bot_token_changed: typeof data.botToken === "string",
      },
    });

    return { ok: true as const };
  });

export const dispatchTelegramQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);

    const { readTelegramConfig, sendTelegramMessage, TELEGRAM_TOKEN_MISSING } = await import(
      "@/lib/telegram.server"
    );
    const config = await readTelegramConfig();
    if (!config.botToken) throw new Error(TELEGRAM_TOKEN_MISSING);
    const token = config.botToken;

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
