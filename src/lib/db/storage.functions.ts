/**
 * CEN-MB-02 — Server function cho tải tệp lên (chỉ khai báo, logic ở *.server.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const uploadSchema = z.object({
  bucket: z.string().min(1).max(64),
  path: z.string().min(1).max(512),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(1).max(8_000_000),
});

const listSchema = z.object({
  bucket: z.string().min(1).max(64),
  paths: z.array(z.string().min(1).max(512)).max(500),
});

export const cenStorageUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data }) => {
    const { getCookie } = await import("@tanstack/react-start/server");
    const { resolveSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");
    const { putObject } = await import("@/lib/db/storage.server");

    const session = await resolveSession(getCookie(SESSION_COOKIE));
    if (!session) throw new Error("Phiên đăng nhập đã hết hạn.");

    const content = Buffer.from(data.base64, "base64");
    if (content.byteLength === 0 || content.byteLength > 5 * 1024 * 1024) {
      throw new Error("Dung lượng tệp không hợp lệ.");
    }
    await putObject({
      userId: session.userId,
      bucket: data.bucket,
      path: data.path,
      mimeType: data.mimeType,
      content,
    });
    return { ok: true as const, updatedAt: new Date().toISOString() };
  });

export const cenStorageList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data }): Promise<{ paths: string[] }> => {
    const { getCookie } = await import("@tanstack/react-start/server");
    const { resolveSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");
    const { listObjectPaths } = await import("@/lib/db/storage.server");

    const session = await resolveSession(getCookie(SESSION_COOKIE));
    if (!session) return { paths: [] };
    return { paths: await listObjectPaths(session.userId, data.bucket, data.paths) };
  });