import { test, expect, mock } from "bun:test";

const calls: any[] = [];
mock.module("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: any, payload: string) => {
      calls.push({ sub, payload });
      if (sub.endpoint.includes("gone")) {
        const e: any = new Error("gone");
        e.statusCode = 410;
        throw e;
      }
      return { statusCode: 201 };
    },
  },
}));

test("web push delivery", async () => {
  const { withPrivileged } = await import("@/db/pool.server");
  const uid = await withPrivileged(async (c) => {
    const { rows } = await c.query(
      "INSERT INTO auth.users (email, encrypted_password, email_confirmed_at) VALUES ($1,'x',now()) RETURNING id",
      [`push${Date.now()}@t.vn`],
    );
    const id = rows[0].id;
    await c.query(
      "INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,'k','a'),($1,$3,'k','a')",
      [id, `https://fcm.test/ok/${id}`, `https://fcm.test/gone/${id}`],
    );
    await c.query(
      "INSERT INTO public.notifications (recipient_id, event_type, title, body, link, event_key) VALUES ($1,'task.assigned','Bạn được giao: Kế hoạch Branding','Deadline 20/08','/tasks/abc',$2)",
      [id, `k${Date.now()}`],
    );
    return id;
  });

  const outbox = await withPrivileged((c) =>
    c.query("SELECT * FROM public.push_outbox WHERE recipient_id=$1", [uid]).then((r) => r.rows),
  );
  expect(outbox.length).toBe(1);

  const { dispatchPushOutbox } = await import("@/lib/push.server");
  const result = await dispatchPushOutbox({});
  expect(result.sent).toBe(1);
  expect(calls.length).toBe(2);
  const payload = JSON.parse(calls[0].payload);
  expect(payload.category).toBe("Công việc mới");
  expect(payload.title).toBe("Bạn được giao: Kế hoạch Branding");
  expect(payload.url).toBe("https://cenwork.tudogroup.vn/tasks/abc");

  const after = await withPrivileged((c) =>
    c.query("SELECT status FROM public.push_outbox WHERE recipient_id=$1", [uid]).then((r) => r.rows),
  );
  expect(after[0].status).toBe("sent");

  const subs = await withPrivileged((c) =>
    c
      .query("SELECT endpoint, enabled FROM public.push_subscriptions WHERE user_id=$1 ORDER BY endpoint", [uid])
      .then((r) => r.rows),
  );
  expect(subs.find((s: any) => s.endpoint.includes("gone")).enabled).toBe(false);
  expect(subs.find((s: any) => s.endpoint.includes("ok")).enabled).toBe(true);

  // Chạy lại: không gửi trùng.
  calls.length = 0;
  const again = await dispatchPushOutbox({});
  expect(again.sent).toBe(0);
  expect(calls.length).toBe(0);
});
