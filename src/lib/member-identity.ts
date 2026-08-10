import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";

/**
 * MEMBER-LOCK-01 — danh tính thành viên đã khóa.
 * Tên thật vẫn giữ nguyên trong database; ở các màn hình nghiệp vụ thông thường
 * tên của tài khoản đã khóa được hiển thị thành `***`.
 * Admin xem tên thật trong "Tài khoản lưu trữ" và Nhật ký hoạt động.
 */
export const MASKED_NAME = "***";

interface LockedIdentity {
  ids: Set<string>;
  names: Set<string>;
  viewerIsAdmin: boolean;
}

const EMPTY: LockedIdentity = { ids: new Set(), names: new Set(), viewerIsAdmin: false };

let snapshot: LockedIdentity = EMPTY;
let inflight: Promise<LockedIdentity> | null = null;
let loadedAt = 0;
const TTL_MS = 60_000;

async function load(): Promise<LockedIdentity> {
  // ORG-VIEW-01: mọi người dùng đều đọc được danh sách id đã khóa (không kèm tên) để che tên.
  const [lockedResult, adminResult] = await Promise.all([
    supabase.rpc("locked_member_ids"),
    supabase.rpc("current_app_role"),
  ]);
  const ids = (lockedResult.data ?? []) as string[];
  snapshot = {
    ids: new Set(ids),
    names: new Set<string>(),
    viewerIsAdmin: adminResult.data === "admin",
  };
  loadedAt = Date.now();
  return snapshot;
}

/** Nạp (có cache ngắn) danh sách tài khoản đã khóa trước khi map dữ liệu hiển thị. */
export async function primeLockedIdentity(force = false): Promise<LockedIdentity> {
  if (!force && Date.now() - loadedAt < TTL_MS) return snapshot;
  if (!inflight) {
    inflight = load().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Xóa cache sau khi khóa/khôi phục tài khoản. */
export function resetLockedIdentity() {
  loadedAt = 0;
  snapshot = EMPTY;
}

/** Ẩn tên tài khoản đã khóa; Admin vẫn thấy tên thật. */
export function maskName<T extends string | null | undefined>(
  name: T,
  userId?: string | null,
): T | string {
  if (!name) return name;
  if (snapshot.viewerIsAdmin) return name;
  if (userId && snapshot.ids.has(userId)) return MASKED_NAME;
  if (snapshot.names.has(name)) return MASKED_NAME;
  return name;
}

export interface ArchivedMemberRow {
  id: string;
  display_name: string;
  email: string;
  job_title: string | null;
  role: string | null;
  team_id: string | null;
  team_name: string | null;
  locked_at: string | null;
  locked_by: string | null;
  locked_by_name: string | null;
  lock_reason: string | null;
  phone_number: string | null;
}

/** Danh sách tài khoản lưu trữ — RPC tự chặn nếu người gọi không phải Admin. */
export async function fetchArchivedMembers(): Promise<ArchivedMemberRow[]> {
  const { data, error } = await supabase.rpc("member_archived_list");
  if (error) throw new Error(error.message);
  return (data ?? []) as ArchivedMemberRow[];
}

export const archivedMembersQuery = (enabled: boolean) =>
  queryOptions({
    queryKey: ["members", "archived"],
    queryFn: fetchArchivedMembers,
    enabled,
  });

export interface LockBlockers {
  teams: { id: string; name: string }[];
  projects: { id: string; name: string; status: string }[];
  tasks: { id: string; name: string; status: string }[];
  total: number;
}

/** Trách nhiệm chưa chuyển giao của một tài khoản — RPC chỉ cho Admin. */
export async function fetchLockBlockers(userId: string): Promise<LockBlockers> {
  const { data, error } = await supabase.rpc("member_lock_blockers", { _user: userId });
  if (error) throw new Error(error.message);
  return data as unknown as LockBlockers;
}

export const lockBlockersQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["member-lock-blockers", userId],
    queryFn: () => fetchLockBlockers(userId!),
    enabled: Boolean(userId),
    staleTime: 0,
  });
