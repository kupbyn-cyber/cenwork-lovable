import { createFileRoute } from "@tanstack/react-router";

/**
 * CEN WORK — Điểm gọi tác vụ định kỳ cho bản deploy độc lập (Mắt Bão).
 *
 * Trên hạ tầng cũ các tác vụ này do pg_cron trong CSDL chạy. Máy chủ PostgreSQL
 * thuần thường không bật pg_cron, nên hệ thống cron của máy chủ sẽ gọi endpoint
 * này. Mọi tác vụ đều idempotent: gọi lặp không sinh dữ liệu trùng.
 *
 * Bảo vệ bằng CEN_CRON_SECRET (bí mật riêng, so sánh chống dò thời gian).
 */
const JOBS = {
  "report-reminders": "report_run_reminders",
  "announcement-reminders": "announcement_enqueue_reminders",
  "approval-overdue": "approval_mark_overdue",
  "duty-overdue": "duty_mark_overdue",
  "nap-reminders": "nap_run_reminders",
  "task-recurrence": "task_recurrence_run",
} as const;

type JobName = keyof typeof JOBS;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CEN_CRON_SECRET"] ?? "";
        const provided =
          request.headers.get("x-cen-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!expected || !safeEqual(expected, provided)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: { job?: string } = {};
        try {
          body = (await request.json()) as { job?: string };
        } catch {
          body = {};
        }

        const requested = body.job && body.job !== "all" ? [body.job] : Object.keys(JOBS);
        const unknown = requested.filter((job) => !(job in JOBS));
        if (unknown.length > 0) {
          return Response.json({ error: `Tác vụ không hợp lệ: ${unknown.join(", ")}` }, { status: 400 });
        }

        const { withPrivileged } = await import("@/db/pool.server");
        const results: Record<string, "ok" | string> = {};

        for (const job of requested as JobName[]) {
          try {
            await withPrivileged(async (client) => {
              await client.query(`SELECT public.${JOBS[job]}()`);
            });
            results[job] = "ok";
          } catch (error) {
            console.error("[cron]", job, (error as Error).message);
            results[job] = (error as Error).message;
          }
        }

        // Hàng đợi Telegram chạy ngay sau khi các tác vụ sinh tin nhắn.
        try {
          const { dispatchOutbox } = await import("@/lib/telegram-dispatch.server");
          const dispatched = await dispatchOutbox({ actorId: null });
          return Response.json({ ok: true, jobs: results, telegram: dispatched });
        } catch (error) {
          return Response.json({ ok: true, jobs: results, telegram: { error: (error as Error).message } });
        }
      },
    },
  },
});
