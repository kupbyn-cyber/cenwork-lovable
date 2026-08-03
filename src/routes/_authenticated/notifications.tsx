import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * NOTIFY-UX-01 — hộp thư thông báo đã hợp nhất vào /announcements.
 * Giữ route cũ để tương thích link đã phát hành.
 */
export const Route = createFileRoute("/_authenticated/notifications")({
  beforeLoad: () => {
    throw redirect({ to: "/announcements", search: { kind: "system" } });
  },
});
