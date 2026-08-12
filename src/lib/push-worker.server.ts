/**
 * CEN WORK — NOTIFY-PUSH-01: worker nền đẩy hàng đợi Web Push.
 * Self-host Mắt Bão không có pg_cron/crontab nên worker chạy ngay trong tiến
 * trình SSR, cùng nguyên tắc với worker Telegram: khóa cấp transaction để nhiều
 * tiến trình không gửi trùng, và mọi lỗi chỉ ghi log (không kéo sập CEN).
 */
let started = false;
let running = false;

const DEFAULT_INTERVAL_SECONDS = 20;
const ADVISORY_LOCK_KEY = 774_120_502;

function intervalMs(): number {
  const raw = Number(process.env["CEN_PUSH_WORKER_INTERVAL"] ?? DEFAULT_INTERVAL_SECONDS);
  const seconds = Number.isFinite(raw) && raw >= 5 ? raw : DEFAULT_INTERVAL_SECONDS;
  return seconds * 1000;
}

export async function runPushDispatchOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const { withPrivileged } = await import("@/db/pool.server");
    const { dispatchPushOutbox, readVapidConfig } = await import("@/lib/push.server");
    if (!readVapidConfig()) return;

    await withPrivileged(async (client) => {
      const { rows } = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_xact_lock($1) AS locked",
        [ADVISORY_LOCK_KEY],
      );
      if (!rows[0]?.locked) return;
      const result = await dispatchPushOutbox({});
      if (result.sent || result.failed) {
        console.log(`[push-worker] sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`);
      }
    });
  } catch (error) {
    console.error("[push-worker]", (error as Error).message);
  } finally {
    running = false;
  }
}

export function startPushWorker(): void {
  if (started) return;
  if (typeof process === "undefined" || typeof setInterval !== "function") return;
  if (process.env["CEN_PUSH_WORKER"] === "0") return;
  const url = process.env["DATABASE_URL"];
  if (!url || !url.trim()) return;
  if (!process.env["VAPID_PUBLIC_KEY"] || !process.env["VAPID_PRIVATE_KEY"]) return;

  started = true;
  const timer = setInterval(() => void runPushDispatchOnce(), intervalMs());
  (timer as { unref?: () => void }).unref?.();
  const kickoff = setTimeout(() => void runPushDispatchOnce(), 10_000);
  (kickoff as { unref?: () => void }).unref?.();
  console.log(`[push-worker] bật, chu kỳ ${intervalMs() / 1000}s`);
}
