/**
 * CEN 1.0 — M5 gửi Telegram (server-only).
 * Bot Token chỉ đọc từ biến môi trường phía server, không log và không trả về client.
 */
const TELEGRAM_API = "https://api.telegram.org";

export const TELEGRAM_TOKEN_MISSING =
  "Chưa cấu hình Bot Token Telegram ở backend nên chưa thể gửi tin.";

export interface TelegramTarget {
  chatId: string;
  topicId: string | null;
  message: string;
}

export function readBotToken(): string | null {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  return token && token.trim() ? token.trim() : null;
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
