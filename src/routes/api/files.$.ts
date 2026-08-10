import { createFileRoute } from "@tanstack/react-router";

/**
 * CEN-MB-02 — Phục vụ tệp lưu trong PostgreSQL (ảnh đại diện).
 * Bắt buộc có phiên đăng nhập hợp lệ; quyền đọc do RLS của `file_objects` quyết định.
 * Không dùng cache dùng chung vì nội dung phụ thuộc người dùng.
 */
export const Route = createFileRoute("/api/files/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const splat = (params as { _splat?: string })._splat ?? "";
        const [bucket, ...rest] = splat.split("/");
        const path = rest.join("/");
        if (!bucket || !path) return new Response("Not found", { status: 404 });

        const { getCookie } = await import("@tanstack/react-start/server");
        const { resolveSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");
        const session = await resolveSession(getCookie(SESSION_COOKIE));
        if (!session) return new Response("Unauthorized", { status: 401 });

        const { getObject } = await import("@/lib/db/storage.server");
        const object = await getObject(session.userId, bucket, path);
        if (!object) return new Response("Not found", { status: 404 });

        return new Response(new Uint8Array(object.content), {
          status: 200,
          headers: {
            "content-type": object.mimeType,
            "cache-control": "private, max-age=0, must-revalidate",
            "content-length": String(object.content.byteLength),
          },
        });
      },
    },
  },
});