/**
 * CEN WORK — NOTI-FIX-01: bộ chạy nền đẩy hàng đợi Telegram cho bản self-host.
 *
 * PostgreSQL thuần không có pg_cron (lớp compat chỉ là no-op) và máy chủ Mắt Bão
 * không cài crontab, nên trước đây không process nào gọi dispatcher. Worker này
 * chạy ngay trong tiến trình SSR production: mỗi CEN_TELEGRAM_WORKER_INTERVAL giây
 * (mặc định 60s, đúng cadence crontab cũ) gọi lại đúng dispatchOutbox() hiện có.
 *
 * Nguyên tắc: không bao giờ làm sập CEN — mọi lỗi chỉ ghi log, không ném ra ngoài.
 */
let started = false;
let running = false;

const DEFAULT_INTERVAL_SECONDS = 60;
// Khóa tư vấn PostgreSQL: nhiều tiến trình/replica chỉ một cái dispatch mỗi lượt.
const ADVISORY_LOCK_KEY = 774_120_501;

function intervalMs(): number {
  const raw = Number(process.env["CEN_TELEGRAM_WORKER_INTERVAL"] ?? DEFAULT_INTERVAL_SECONDS);
  const seconds = Number.isFinite(raw) && raw >= 10 ? raw : DEFAULT_INTERVAL_SECONDS;
  return seconds * 1000;
}

async function runOnce(): Promise<void> {
  if (running) return; // single-flight: lượt trước chưa xong thì bỏ qua lượt này.
  running = true;
  try {
    const { withPrivileged } = await import("@/db/pool.server");
    const { dispatchOutbox } = await import("@/lib/telegram-dispatch.server");

    await withPrivileged(async (client) => {
      const { rows } = await client.query<{ locked: boolean }>(
        // Khóa cấp TRANSACTION: PostgreSQL tự nhả khi COMMIT/ROLLBACK.
        // Bản cũ dùng khóa cấp session và nhả bằng câu lệnh riêng — nếu transaction
        // đã lỗi thì câu nhả đó cũng lỗi, kết nối được trả về pool trong khi vẫn giữ
        // khóa, và mọi lượt chạy sau đều bị chặn vĩnh viễn (worker im lặng, không gửi).
        "SELECT pg_try_advisory_xact_lock($1) AS locked",
        [ADVISORY_LOCK_KEY],
      );
      if (!rows[0]?.locked) return;
      const result = await dispatchOutbox({ actorId: null });
      if (result.sent || result.failed) {
        console.log(
          `[telegram-worker] sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
        );
      }
    });
  } catch (error) {
    // Thiếu Bot Token, Telegram lỗi tạm thời, DB bận… đều không được kéo sập CEN.
    console.error("[telegram-worker]", (error as Error).message);
  } finally {
    running = false;
  }
}

/** Khởi động worker một lần cho mỗi tiến trình server. An toàn khi gọi lặp. */
export function startTelegramWorker(): void {
  if (started) return;
  if (typeof process === "undefined" || typeof setInterval !== "function") return;
  if (process.env["CEN_TELEGRAM_WORKER"] === "0") return;
  const url = process.env["DATABASE_URL"];
  if (!url || !url.trim()) return; // Bản xem trước (không PostgreSQL riêng) giữ nguyên hành vi cũ.

  started = true;
  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs());
  (timer as { unref?: () => void }).unref?.();
  // Lượt đầu chạy sau 15s để không tranh tài nguyên lúc container vừa khởi động.
  const kickoff = setTimeout(() => void runOnce(), 15_000);
  (kickoff as { unref?: () => void }).unref?.();
  console.log(`[telegram-worker] bật, chu kỳ ${intervalMs() / 1000}s`);
}
