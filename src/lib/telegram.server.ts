/**
 * CEN WORK — M5 gửi Telegram (server-only).
 * Bot Token chỉ đọc phía server: ưu tiên cấu hình trong bảng telegram_config,
 * dự phòng biến môi trường. Không log và không trả về client.
 */
const TELEGRAM_API = "https://api.telegram.org";

export const TELEGRAM_TOKEN_MISSING =
  "Chưa cấu hình Bot Token Telegram nên chưa thể gửi tin.";

export interface TelegramTarget {
  chatId: string;
  topicId: string | null;
  message: string;
}

export interface TelegramConfig {
  botToken: string | null;
  groupChatId: string;
}

export const DEFAULT_GROUP_CHAT_ID = "-1002041537249";

function readEnvToken(): string | null {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  return token && token.trim() ? token.trim() : null;
}

export function readBotToken(): string | null {
  return readEnvToken();
}

/** Đọc cấu hình Telegram dùng chung bằng service role (không lộ ra client). */
export async function readTelegramConfig(): Promise<TelegramConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("telegram_config")
    .select("bot_token,group_chat_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const stored = data?.bot_token?.trim() || null;
  return {
    botToken: stored ?? readEnvToken(),
    groupChatId: data?.group_chat_id?.trim() || DEFAULT_GROUP_CHAT_ID,
  };
}

/** Che token khi hiển thị cho Admin: chỉ giữ vài ký tự đầu/cuối. */
export function maskToken(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 10) return "••••••";
  return `${token.slice(0, 6)}••••${token.slice(-4)}`;
}

/** Gửi một tin nhắn. Trả về lỗi dạng chuỗi an toàn (không chứa token). */
export async function sendTelegramMessage(
  token: string,
  target: TelegramTarget,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target.chatId,
        text: target.message,
        disable_web_page_preview: true,
        ...(target.topicId ? { message_thread_id: Number(target.topicId) } : {}),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        error: `Telegram ${response.status}: ${payload?.description ?? "gửi thất bại"}`.slice(
          0,
          400,
        ),
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message.slice(0, 400) };
  }
}
