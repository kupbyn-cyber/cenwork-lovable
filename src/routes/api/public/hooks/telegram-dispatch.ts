import { createFileRoute } from "@tanstack/react-router";

/**
 * CEN WORK — Worker gửi hàng đợi Telegram, được pg_cron gọi định kỳ.
 * Xác thực bằng apikey (anon key) của project; Bot Token chỉ đọc phía server.
 */
export const Route = createFileRoute("/api/public/hooks/telegram-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Bản deploy độc lập dùng CEN_CRON_SECRET; bản cũ vẫn nhận apikey của project.
        const expected =
          process.env["CEN_CRON_SECRET"] ??
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          process.env["SUPABASE_ANON_KEY"] ??
          "";
        const provided =
          request.headers.get("x-cen-cron-secret") ??
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!expected || provided !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const { dispatchOutbox } = await import("@/lib/telegram-dispatch.server");
          const result = await dispatchOutbox({ actorId: null });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("[telegram-dispatch]", (error as Error).message);
          return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
        }
      },
    },
  },
});
