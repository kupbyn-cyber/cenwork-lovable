/**
 * CEN-MB-02 — Điểm truy cập dữ liệu duy nhất của ứng dụng.
 *
 * Khi `VITE_CEN_DB=postgres` (bản deploy Mắt Bão), toàn bộ truy vấn, đăng nhập
 * và tệp đính kèm chạy trên PostgreSQL thuần do CEN tự quản. Khi không đặt biến
 * này, ứng dụng dùng lại hạ tầng cũ để bản xem trước hoạt động y như trước.
 *
 * Mọi module nghiệp vụ chỉ import `supabase` từ đây — không import trực tiếp SDK.
 */
// Chỉ là tham chiếu lười (Proxy): ở chế độ postgres không thuộc tính nào bị chạm
// nên client Supabase không bao giờ được khởi tạo và không cần biến môi trường.
import { supabase as legacyClient } from "@/integrations/supabase/client";
import {
  cenCurrentUser,
  cenLogin,
  cenLogout,
  cenSetDisplayName,
  cenSetPassword,
} from "@/lib/auth.functions";
import { createCenDataClient } from "@/lib/db/pg-rest-client";
import { cenStorageList, cenStorageUpload } from "@/lib/db/storage.functions";

export function isPostgresMode(): boolean {
  return import.meta.env["VITE_CEN_DB"] === "postgres";
}

interface CenUser {
  id: string;
  email: string;
  user_metadata: { display_name: string };
}

interface CenSession {
  user: CenUser;
  access_token: string;
  expires_at: number;
}

type AuthListener = (event: string, session: CenSession | null) => void;

const listeners = new Set<AuthListener>();
let cachedSession: CenSession | null = null;

function notify(event: string, session: CenSession | null) {
  cachedSession = session;
  for (const listener of listeners) listener(event, session);
}

function toSession(user: {
  userId: string;
  email: string;
  displayName: string;
} | null): CenSession | null {
  if (!user) return null;
  return {
    user: {
      id: user.userId,
      email: user.email,
      user_metadata: { display_name: user.displayName },
    },
    // Phiên thật nằm trong cookie HttpOnly; giá trị này chỉ để tương thích kiểu dữ liệu.
    access_token: "cen-session",
    expires_at: 0,
  };
}

function toError(error: unknown) {
  return { message: error instanceof Error ? error.message : "Đã có lỗi xảy ra." };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được tệp."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

const cenAuth = {
  async getUser() {
    try {
      const result = await cenCurrentUser();
      const session = toSession(result.user);
      cachedSession = session;
      return { data: { user: session?.user ?? null }, error: session ? null : toError(null) };
    } catch (error) {
      return { data: { user: null }, error: toError(error) };
    }
  },

  async getSession() {
    try {
      const result = await cenCurrentUser();
      const session = toSession(result.user);
      cachedSession = session;
      return { data: { session }, error: null };
    } catch (error) {
      return { data: { session: null }, error: toError(error) };
    }
  },

  async signInWithPassword(credentials: { email: string; password: string }) {
    try {
      await cenLogin({ data: credentials });
      const result = await cenCurrentUser();
      const session = toSession(result.user);
      notify("SIGNED_IN", session);
      return { data: { session, user: session?.user ?? null }, error: null };
    } catch (error) {
      return { data: { session: null, user: null }, error: toError(error) };
    }
  },

  async signOut(_options?: { scope?: string }) {
    try {
      await cenLogout();
      notify("SIGNED_OUT", null);
      return { error: null };
    } catch (error) {
      return { error: toError(error) };
    }
  },

  async updateUser(payload: { password?: string; data?: { display_name?: string } }) {
    try {
      if (payload.password) await cenSetPassword({ data: { password: payload.password } });
      if (payload.data?.display_name) {
        await cenSetDisplayName({ data: { displayName: payload.data.display_name } });
      }
      const result = await cenCurrentUser();
      const session = toSession(result.user);
      notify("USER_UPDATED", session);
      return { data: { user: session?.user ?? null }, error: null };
    } catch (error) {
      return { data: { user: null }, error: toError(error) };
    }
  },

  onAuthStateChange(callback: AuthListener) {
    listeners.add(callback);
    // Phát lại trạng thái đã biết để giao diện không phải chờ vòng mạng đầu tiên.
    queueMicrotask(() => callback("INITIAL_SESSION", cachedSession));
    return {
      data: {
        subscription: {
          unsubscribe() {
            listeners.delete(callback);
          },
        },
      },
    };
  },
};

function signedUrlFor(bucket: string, path: string): string {
  return `/api/files/${bucket}/${path}?v=${Date.now()}`;
}

const cenStorage = {
  from(bucket: string) {
    return {
      async upload(
        path: string,
        file: File,
        options?: { upsert?: boolean; contentType?: string; cacheControl?: string },
      ) {
        try {
          const base64 = await fileToBase64(file);
          await cenStorageUpload({
            data: {
              bucket,
              path,
              mimeType: (options?.contentType ?? file.type) as
                | "image/jpeg"
                | "image/png"
                | "image/webp",
              base64,
            },
          });
          return { data: { path }, error: null };
        } catch (error) {
          return { data: null, error: toError(error) };
        }
      },

      async createSignedUrl(path: string, _expiresIn: number) {
        return { data: { signedUrl: signedUrlFor(bucket, path) }, error: null };
      },

      async createSignedUrls(paths: string[], _expiresIn: number) {
        try {
          const { paths: existing } = await cenStorageList({ data: { bucket, paths } });
          return {
            data: existing.map((path) => ({ path, signedUrl: signedUrlFor(bucket, path) })),
            error: null,
          };
        } catch (error) {
          return { data: null, error: toError(error) };
        }
      },
    };
  },
};

function createClient() {
  const data = createCenDataClient();
  return {
    from: data.from,
    rpc: data.rpc,
    auth: cenAuth,
    storage: cenStorage,
  };
}

type LegacyClient = typeof legacyClient;

/**
 * Client dùng chung. Kiểu dữ liệu giữ nguyên như trước để toàn bộ module CEN
 * không phải sửa; phần thực thi bên dưới đổi theo cấu hình triển khai.
 */
export const supabase: LegacyClient = (
  isPostgresMode() ? (createClient() as unknown as LegacyClient) : legacyClient
) as LegacyClient;