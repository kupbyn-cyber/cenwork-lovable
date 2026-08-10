/**
 * CEN-MB-03 — Dựng ngữ cảnh xác thực trên hạ tầng cũ (bản xem trước).
 * Tách riêng để middleware dùng chung có thể nạp động, không kéo SDK vào
 * bản deploy PostgreSQL.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

function isOpaqueKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export async function buildLegacyAuthContext(authHeader: string | null): Promise<{
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
}> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Thiếu cấu hình máy chủ xác thực.");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const token = authHeader.slice("Bearer ".length);
  if (token.split(".").length !== 3) throw new Error("Unauthorized");

  const supabase = createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isOpaqueKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Error("Unauthorized");
  return {
    supabase,
    userId: String(data.claims.sub),
    claims: data.claims as unknown as Record<string, unknown>,
  };
}
