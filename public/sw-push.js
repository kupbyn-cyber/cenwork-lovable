/**
 * CEN WORK — NOTIFY-PUSH-01: Service Worker chỉ phục vụ Web Push.
 *
 * KHÔNG cache app shell, không can thiệp fetch/navigation: đây là worker gửi
 * thông báo hệ điều hành (giống worker messaging), nên không ảnh hưởng preview
 * hay bản build của CEN.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (_error) {
    return { title: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const body = [payload.category, payload.title, payload.body]
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter(Boolean)
    .join("\n");

  event.waitUntil(
    self.registration.showNotification("CEN WORK", {
      body: body || "Bạn có thông báo mới trong CEN.",
      tag: payload.notificationId || undefined,
      icon: "/brand/logo-mark.svg",
      badge: "/brand/logo-mark.svg",
      data: { url: typeof payload.url === "string" && payload.url ? payload.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        if ("navigate" in client) {
          try {
            await client.navigate(target.href);
          } catch (_error) {
            /* tab không cho điều hướng: vẫn giữ focus */
          }
        }
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
