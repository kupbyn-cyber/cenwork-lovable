import { supabase } from "@/integrations/cen/client";

/**
 * TASK-FIX-01 — bản đồ id → tên hiển thị dùng chung.
 * RLS của `profiles` chỉ cho đọc hồ sơ trong phạm vi của người dùng, nên các join
 * nhúng (assignee/creator/reviewer) có thể trả về null dù Task đã có người phụ trách.
 * `member_directory` là danh bạ nội bộ mọi người dùng đăng nhập đều đọc được, dùng
 * làm nguồn dự phòng để tên không bị mất.
 */
let names = new Map<string, string>();
let inflight: Promise<Map<string, string>> | null = null;
let loadedAt = 0;
const TTL_MS = 60_000;

async function load(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("member_directory");
  if (error) return names;
  const next = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; display_name: string | null }[]) {
    if (row.id && row.display_name) next.set(row.id, row.display_name);
  }
  names = next;
  loadedAt = Date.now();
  return names;
}

export async function primeMemberNames(force = false): Promise<Map<string, string>> {
  if (!force && Date.now() - loadedAt < TTL_MS) return names;
  if (!inflight) {
    inflight = load().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Tên hiển thị đã nạp sẵn (chưa che tên khóa — gọi maskName sau). */
export function memberName(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return names.get(userId) ?? null;
}
