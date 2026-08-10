/**
 * CEN-MB-02 — Lưu trữ tệp trên PostgreSQL thuần (thay dịch vụ Storage bên ngoài).
 * Mọi thao tác chạy dưới danh tính người dùng đăng nhập nên RLS của
 * `public.file_objects` là ranh giới quyền thật sự.
 */
import { withUser } from "@/db/pool.server";

export interface StoredObject {
  mimeType: string;
  content: Buffer;
  updatedAt: string;
}

export async function putObject(input: {
  userId: string;
  bucket: string;
  path: string;
  mimeType: string;
  content: Buffer;
}): Promise<void> {
  await withUser(input.userId, async (client) => {
    await client.query(
      `INSERT INTO public.file_objects (bucket, path, owner_id, mime_type, byte_size, content)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (bucket, path) DO UPDATE
         SET mime_type = EXCLUDED.mime_type,
             byte_size = EXCLUDED.byte_size,
             content = EXCLUDED.content,
             owner_id = EXCLUDED.owner_id,
             updated_at = now()`,
      [input.bucket, input.path, input.userId, input.mimeType, input.content.byteLength, input.content],
    );
  });
}

export async function getObject(
  userId: string,
  bucket: string,
  path: string,
): Promise<StoredObject | null> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{
      mime_type: string;
      content: Buffer;
      updated_at: Date;
    }>(
      "SELECT mime_type, content, updated_at FROM public.file_objects WHERE bucket = $1 AND path = $2",
      [bucket, path],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      mimeType: row.mime_type,
      content: row.content,
      updatedAt: row.updated_at.toISOString(),
    };
  });
}

export async function listObjectPaths(
  userId: string,
  bucket: string,
  paths: string[],
): Promise<string[]> {
  if (paths.length === 0) return [];
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ path: string }>(
      "SELECT path FROM public.file_objects WHERE bucket = $1 AND path = ANY($2)",
      [bucket, paths],
    );
    return rows.map((row) => row.path);
  });
}