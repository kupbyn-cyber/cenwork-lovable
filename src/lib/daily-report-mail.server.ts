/**
 * TASK-DAILY-01B — Gửi email báo cáo công việc hằng ngày (server-only).
 *
 * Nguyên tắc:
 * - Chỉ đọc thông tin SMTP từ biến môi trường máy chủ; không bao giờ đưa vào DB,
 *   không trả về UI, không ghi log mật khẩu.
 * - Không tự truy vấn Task: file đính kèm luôn do engine TASK-DAILY-01A tạo.
 */

export class MailConfigError extends Error {
  code = "SMTP_NOT_CONFIGURED";
}

export class MailSendError extends Error {
  code = "SMTP_SEND_FAILED";
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  from: string;
}

/** Đọc cấu hình SMTP; thiếu biến bắt buộc → lỗi cấu hình rõ ràng, không lộ giá trị. */
export function readSmtpConfig(): SmtpConfig {
  const host = (process.env["SMTP_HOST"] ?? "").trim();
  const portRaw = (process.env["SMTP_PORT"] ?? "587").trim();
  const user = (process.env["SMTP_USER"] ?? "").trim() || undefined;
  const password = process.env["SMTP_PASSWORD"] ?? undefined;
  const from = (process.env["SMTP_FROM"] ?? "").trim() || user || "";
  const port = Number.parseInt(portRaw, 10);

  const missing: string[] = [];
  if (!host) missing.push("SMTP_HOST");
  if (!Number.isFinite(port) || port <= 0) missing.push("SMTP_PORT");
  if (!from) missing.push("SMTP_FROM");
  if (missing.length > 0) {
    throw new MailConfigError(
      `Chưa cấu hình máy chủ email trên server (thiếu: ${missing.join(", ")}).`,
    );
  }

  const secureEnv = (process.env["SMTP_SECURE"] ?? "").trim().toLowerCase();
  const secure = secureEnv ? secureEnv === "true" || secureEnv === "1" : port === 465;

  return { host, port, secure, user, password, from };
}

export interface MailAttachment {
  filename: string;
  content: Uint8Array;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}

/** Rút gọn lỗi SMTP để hiển thị: không kèm credential, không kèm chuỗi kết nối. */
function safeMailError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\b(pass(word)?|auth|token)\b\s*[:=]\s*\S+/gi, "$1: ***").slice(0, 200);
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const config = readSmtpConfig();
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user ? { auth: { user: config.user, pass: config.password ?? "" } } : {}),
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.attachments && input.attachments.length > 0
        ? {
            attachments: input.attachments.map((item) => ({
              filename: item.filename,
              content: Buffer.from(item.content),
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            })),
          }
        : {}),
    });
  } catch (error) {
    throw new MailSendError(`Máy chủ email từ chối gửi: ${safeMailError(error)}`);
  }
}
