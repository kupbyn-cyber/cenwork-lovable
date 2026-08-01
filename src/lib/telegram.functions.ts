import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * CEN WORK — M5 server function cấu hình và vận hành Telegram.
 * Chỉ Admin và CMO được cấu hình và kích hoạt; Bot Token và service role chỉ tồn tại phía server.
 * Báo cáo ngày đi vào Group Chat chung + Daily Report Topic chung (hàng đợi do trigger DB tạo).
 * Notification cá nhân giữ nguyên: gửi tới Telegram User ID của từng thành viên.
 */
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  // Quản trị toàn hệ thống = Admin hoặc CMO (hàm database is_system_admin là ràng buộc thật).
  const { data: isSystemAdmin, error } = await (context.supabase.rpc as any)("is_system_admin", {
    _user_id: context.userId,
  });
  if (error) throw new Error((error as { message: string }).message);
  if (!isSystemAdmin) throw new Error("Chỉ Admin hoặc CMO được quản trị Telegram.");
}

export const getTelegramConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { readTelegramConfig, maskToken } = await import("@/lib/telegram.server");
    const config = await readTelegramConfig();
    return {
      groupChatId: config.groupChatId,
      dailyReportTopicId: config.dailyReportTopicId ?? "",
      botConfigured: Boolean(config.botToken),
      botTokenMasked: maskToken(config.botToken),
    };
  });

export const saveTelegramConfig = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { botToken?: string | null; groupChatId: string; dailyReportTopicId?: string }) => {
      const groupChatId = input.groupChatId.trim();
      if (!/^-?\d{5,20}$/.test(groupChatId)) {
        throw new Error("Group Chat ID phải là dãy số hợp lệ, ví dụ -1002041537249.");
      }
      const dailyReportTopicId = (input.dailyReportTopicId ?? "").trim();
      if (dailyReportTopicId && !/^\d{1,12}$/.test(dailyReportTopicId)) {
        throw new Error("Daily Report Topic Thread ID phải là số nguyên dương.");
      }
      const botToken =
        typeof input.botToken === "string" ? input.botToken.trim() : (input.botToken ?? undefined);
      if (
        typeof botToken === "string" &&
        botToken &&
        !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(botToken)
      ) {
        throw new Error("Bot Token không đúng định dạng của Telegram.");
      }
      return { groupChatId, dailyReportTopicId, botToken };
    },
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: Record<string, unknown> = {
      id: true,
      group_chat_id: data.groupChatId,
      daily_report_topic_id: data.dailyReportTopicId || null,
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
        daily_report_topic_id: data.dailyReportTopicId || null,
        bot_token_changed: typeof data.botToken === "string",
      },
    });

    return { ok: true as const };
  });

/** Kiểm tra kết nối: gửi một tin kiểm tra cấu hình vào đúng Group + Topic Báo cáo ngày. */
export const testTelegramConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { readTelegramConfig, sendTelegramMessage, TELEGRAM_TOKEN_MISSING } = await import(
      "@/lib/telegram.server"
    );
    const config = await readTelegramConfig();
    if (!config.botToken) throw new Error(TELEGRAM_TOKEN_MISSING);
    if (!config.dailyReportTopicId) {
      throw new Error("Chưa cấu hình Daily Report Topic Thread ID.");
    }

    const result = await sendTelegramMessage(config.botToken, {
      chatId: config.groupChatId,
      topicId: config.dailyReportTopicId,
      message:
        "🔧 CEN WORK — tin kiểm tra cấu hình Telegram.\n" +
        "Đây KHÔNG phải Báo cáo ngày và không phải notification nghiệp vụ.\n" +
        `Thời điểm kiểm tra: ${new Date().toISOString()}`,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "telegram.config_tested",
      entity_type: "telegram_config",
      result: result.ok ? "success" : "failure",
      metadata: result.ok ? {} : { error: result.error },
    });

    if (!result.ok) throw new Error(result.error);
    return { ok: true as const };
  });

async function processOutboxRows(
  rows: Array<{ id: string; chat_id: string; topic_id: string | null; message: string; attempts: number }>,
  token: string,
  actorId: string,
) {
  const { sendTelegramMessage } = await import("@/lib/telegram.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
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
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
          telegram_message_id: result.messageId,
        })
        .eq("id", row.id);
    } else {
      failed += 1;
      await supabaseAdmin
        .from("telegram_outbox")
        .update({ status: "failed", last_error: result.error })
        .eq("id", row.id);
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      action: result.ok ? "telegram.sent" : "telegram.failed",
      entity_type: "telegram_outbox",
      entity_id: row.id,
      result: result.ok ? "success" : "failure",
      metadata: result.ok ? {} : { error: result.error },
    });
  }

  return { sent, failed };
}

export const dispatchTelegramQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);

    const { readTelegramConfig, TELEGRAM_TOKEN_MISSING } = await import("@/lib/telegram.server");
    const config = await readTelegramConfig();
    if (!config.botToken) throw new Error(TELEGRAM_TOKEN_MISSING);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: candidates, error: listError } = await supabaseAdmin
      .from("telegram_outbox")
      .select("id,chat_id,topic_id,message,attempts")
      .neq("status", "sent")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (listError) throw new Error(listError.message);

    const rows = candidates ?? [];
    const { sent, failed } = await processOutboxRows(rows, config.botToken, context.userId);
    return { processed: rows.length, sent, failed };
  });

/** Admin gửi lại đúng một bản ghi lỗi. Không tạo bản ghi mới, không gửi lại tin đã sent. */
export const retryTelegramOutboxItem = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Thiếu mã bản ghi hàng đợi.");
    return { id: input.id };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);

    const { readTelegramConfig, TELEGRAM_TOKEN_MISSING } = await import("@/lib/telegram.server");
    const config = await readTelegramConfig();
    if (!config.botToken) throw new Error(TELEGRAM_TOKEN_MISSING);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("telegram_outbox")
      .select("id,chat_id,topic_id,message,attempts,status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Không tìm thấy bản ghi hàng đợi.");
    if (row.status === "sent") throw new Error("Bản ghi đã gửi thành công, không gửi lại.");

    const { sent, failed } = await processOutboxRows(
      [
        {
          id: row.id,
          chat_id: row.chat_id,
          topic_id: row.topic_id,
          message: row.message,
          attempts: row.attempts,
        },
      ],
      config.botToken,
      context.userId,
    );
    return { sent, failed };
  });

/**
 * Kiểm tra Telegram CÁ NHÂN của một thành viên.
 * Gửi thẳng tới chat cá nhân (telegram_user_id), không dùng Group/Topic, không đi qua luồng Báo cáo ngày.
 * Quyền: đúng phạm vi quản lý thành viên hiện hành (can_manage_profile) hoặc chính mình.
 */
export const testPersonalTelegram = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId) throw new Error("Thiếu mã thành viên.");
    return { userId: input.userId };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    if (data.userId !== context.userId) {
      const { data: allowed, error } = await (context.supabase.rpc as any)("can_manage_profile", {
        _target: data.userId,
      });
      if (error) throw new Error((error as { message: string }).message);
      if (!allowed) throw new Error("Bạn không có quyền kiểm tra Telegram của thành viên này.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("telegram_user_id,telegram_enabled,display_name")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("Không tìm thấy thành viên.");

    const chatId = (profile.telegram_user_id ?? "").trim();
    const nowIso = new Date().toISOString();

    async function record(status: "success" | "failed", errorText: string | null) {
      await supabaseAdmin
        .from("profiles")
        .update({
          telegram_test_status: status,
          telegram_tested_at: nowIso,
          telegram_test_error: errorText,
        })
        .eq("id", data.userId);
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: "telegram.personal_tested",
        entity_type: "profiles",
        entity_id: data.userId,
        result: status === "success" ? "success" : "failure",
        metadata: errorText ? { error: errorText } : {},
      });
    }

    if (!chatId) {
      await record("failed", "Thành viên chưa có Telegram User ID.");
      throw new Error("Thành viên chưa có Telegram User ID.");
    }
    if (!profile.telegram_enabled) {
      await record("failed", "Thành viên đã tắt nhận Telegram cá nhân.");
      throw new Error("Thành viên đã tắt nhận Telegram cá nhân.");
    }

    const { readTelegramConfig, sendTelegramMessage, TELEGRAM_TOKEN_MISSING } = await import(
      "@/lib/telegram.server"
    );
    const config = await readTelegramConfig();
    if (!config.botToken) {
      await record("failed", TELEGRAM_TOKEN_MISSING);
      throw new Error(TELEGRAM_TOKEN_MISSING);
    }

    const result = await sendTelegramMessage(config.botToken, {
      chatId,
      topicId: null,
      message: "CEN test Telegram cá nhân thành công.",
    });

    await record(result.ok ? "success" : "failed", result.ok ? null : result.error);
    if (!result.ok) throw new Error(result.error);
    return { ok: true as const, testedAt: nowIso };
  });
