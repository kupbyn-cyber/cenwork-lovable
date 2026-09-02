/**
 * CEN-PUSH-P01 — Service Worker chỉ phục vụ Web Push.
 * Không cache app shell, không can thiệp fetch/navigation.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (_error) {
    return {};
  }
}

/** Chỉ chấp nhận đường dẫn nội bộ: chặn http://, https://, //host, scheme khác. */
function safeInternalPath(value) {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path) return "/notifications";
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return "/notifications";
  if (path.startsWith("//")) return "/notifications";
  return path.startsWith("/") ? path : `/${path}`;
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const title = typeof payload.title === "string" && payload.title ? payload.title : "CEN";
  const body =
    typeof payload.body === "string" && payload.body
      ? payload.body
      : "Bạn có nội dung mới cần xem trong CEN.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.tag || payload.notificationId || undefined,
      icon: "/brand/logo-mark.svg",
      badge: "/brand/logo-mark.svg",
      data: { path: safeInternalPath(payload.internalPath) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeInternalPath(event.notification.data && event.notification.data.path);
  const target = new URL(path, self.location.origin);

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
