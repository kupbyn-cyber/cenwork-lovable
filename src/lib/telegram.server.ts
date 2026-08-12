/**
 * CEN WORK — M5 gửi Telegram (server-only).
 * Bot Token chỉ đọc phía server: ưu tiên cấu hình trong bảng telegram_config,
 * dự phòng biến môi trường. Không log và không trả về client.
 */
import { getAdminClient } from "@/lib/db/admin-client.server";
const TELEGRAM_API = "https://api.telegram.org";

export const TELEGRAM_TOKEN_MISSING =
  "Chưa cấu hình Bot Token Telegram nên chưa thể gửi tin.";

export interface TelegramTarget {
  chatId: string;
  topicId: string | null;
  message: string;
  /** Chỉ đặt cho tin đã được escape đúng chuẩn (mẫu notification cá nhân). */
  parseMode?: "HTML";
}

export interface TelegramConfig {
  botToken: string | null;
  groupChatId: string;
  dailyReportTopicId: string | null;
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
  const supabaseAdmin = await getAdminClient();
  const { data, error } = await supabaseAdmin
    .from("telegram_config")
    .select("bot_token,group_chat_id,daily_report_topic_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const stored = data?.bot_token?.trim() || null;
  return {
    botToken: stored ?? readEnvToken(),
    groupChatId: data?.group_chat_id?.trim() || DEFAULT_GROUP_CHAT_ID,
    dailyReportTopicId: data?.daily_report_topic_id?.trim() || null,
  };
}

/** Che token khi hiển thị cho Admin: chỉ giữ vài ký tự đầu/cuối. */
export function maskToken(token: string | null): string | null {
  if (!token) return null;
  if (token.length <= 10) return "••••••";
  return `${token.slice(0, 6)}••••${token.slice(-4)}`;
}

/** Giới hạn an toàn dưới mức 4096 ký tự của Telegram. */
const MAX_PART_LENGTH = 3800;

/**
 * Chia nội dung dài thành nhiều phần theo dòng, giữ nguyên thứ tự và không mất Task.
 * Mỗi phần được đánh dấu "(Phần i/n)" để người đọc nhận biết cùng một báo cáo.
 */
export function splitTelegramMessage(message: string): string[] {
  if (message.length <= MAX_PART_LENGTH) return [message];
  const parts: string[] = [];
  let current = "";
  for (const line of message.split("\n")) {
    const chunk = current ? `${current}\n${line}` : line;
    if (chunk.length > MAX_PART_LENGTH && current) {
      parts.push(current);
      current = line.slice(0, MAX_PART_LENGTH);
    } else {
      current = chunk.slice(0, MAX_PART_LENGTH);
    }
  }
  if (current) parts.push(current);
  return parts.map((part, index) => `(Phần ${index + 1}/${parts.length})\n${part}`);
}

export type TelegramSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

async function sendOnePart(
  token: string,
  target: Omit<TelegramTarget, "message">,
  text: string,
): Promise<TelegramSendResult> {
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target.chatId,
        text,
        disable_web_page_preview: true,
        ...(target.parseMode ? { parse_mode: target.parseMode } : {}),
        ...(target.topicId ? { message_thread_id: Number(target.topicId) } : {}),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: { message_id?: number } }
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
    const messageId = payload.result?.message_id;
    return { ok: true, messageId: typeof messageId === "number" ? String(messageId) : null };
  } catch (error) {
    return { ok: false, error: (error as Error).message.slice(0, 400) };
  }
}

/**
 * Gửi một tin nhắn (tự chia phần nếu quá dài).
 * Trả về lỗi dạng chuỗi an toàn, không bao giờ chứa Bot Token.
 */
export async function sendTelegramMessage(
  token: string,
  target: TelegramTarget,
): Promise<TelegramSendResult> {
  const parts = splitTelegramMessage(target.message);
  let firstId: string | null = null;
  for (const [index, part] of parts.entries()) {
    const result = await sendOnePart(token, target, part);
    if (!result.ok) {
      return parts.length > 1
        ? { ok: false, error: `Phần ${index + 1}/${parts.length}: ${result.error}`.slice(0, 400) }
        : result;
    }
    if (index === 0) firstId = result.messageId;
  }
  return { ok: true, messageId: firstId };
}
