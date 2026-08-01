import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * CEN TODAY-02 — Ghi nhận đồng đội (data layer).
 * Mọi ràng buộc thật (quan hệ làm việc, hạn mức 3 lượt/ngày, cửa sổ thu hồi 10 phút)
 * nằm ở RLS và trigger database; lớp này chỉ đọc/ghi và hiển thị thông báo lỗi.
 */
export type RecognitionCategory = Database["public"]["Enums"]["recognition_category"];

export const RECOGNITION_CATEGORY_LABEL: Record<RecognitionCategory, string> = {
  support: "Hỗ trợ kịp thời",
  quality: "Chất lượng công việc",
  speed: "Tốc độ xử lý",
  initiative: "Chủ động",
  teamwork: "Phối hợp tốt",
};

export const RECOGNITION_CATEGORY_ORDER: RecognitionCategory[] = [
  "support",
  "quality",
  "speed",
  "initiative",
  "teamwork",
];

/** Giới hạn nội dung khớp CHECK constraint phía database. */
export const RECOGNITION_MIN_LENGTH = 10;
export const RECOGNITION_MAX_LENGTH = 280;
export const RECOGNITION_DAILY_LIMIT = 3;
/** Cửa sổ thu hồi: 10 phút kể từ lúc gửi. */
export const RECOGNITION_REVOKE_WINDOW_MS = 10 * 60 * 1000;

export interface RecognitionPerson {
  id: string;
  display_name: string;
  avatar_path: string | null;
}

export interface RecognitionRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  category: RecognitionCategory;
  message: string;
  revoked_at: string | null;
  created_at: string;
  sender: RecognitionPerson | null;
  receiver: RecognitionPerson | null;
}

const SELECT_COLUMNS =
  "id,sender_id,receiver_id,category,message,revoked_at,created_at," +
  "sender:profiles!recognitions_sender_id_fkey(id,display_name,avatar_path)," +
  "receiver:profiles!recognitions_receiver_id_fkey(id,display_name,avatar_path)";

function fail(error: { message: string } | null) {
  if (error) throw new Error(friendlyError(error.message));
}

/** Chuyển lỗi database thành thông điệp tiếng Việt cho người dùng cuối. */
export function friendlyError(message: string): string {
  if (message.includes("recognitions_one_per_pair_per_day")) {
    return "Hôm nay bạn đã ghi nhận đồng đội này rồi.";
  }
  if (message.includes("recognitions_message_len")) {
    return `Lời ghi nhận cần từ ${RECOGNITION_MIN_LENGTH} đến ${RECOGNITION_MAX_LENGTH} ký tự.`;
  }
  if (message.includes("recognitions_no_self")) return "Không thể tự ghi nhận chính mình.";
  if (message.includes("row-level security")) {
    return "Bạn chưa có quan hệ làm việc hợp lệ với người này.";
  }
  return message;
}

export interface RecognitionFilter {
  /** Chỉ lấy lời ghi nhận liên quan tới một người (gửi hoặc nhận). */
  personId?: string | null;
  limit?: number;
  offset?: number;
}

export async function fetchRecognitions(filter: RecognitionFilter = {}): Promise<RecognitionRow[]> {
  const limit = filter.limit ?? 20;
  const offset = filter.offset ?? 0;
  let query = supabase
    .from("recognitions")
    .select(SELECT_COLUMNS)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (filter.personId) {
    query = query.or(`sender_id.eq.${filter.personId},receiver_id.eq.${filter.personId}`);
  }
  const { data, error } = await query;
  fail(error);
  return (data ?? []) as unknown as RecognitionRow[];
}

/** Số lượt còn lại trong ngày của chính người dùng (tính ở database theo giờ Hà Nội). */
export async function fetchRecognitionQuota(): Promise<number> {
  const { data, error } = await supabase.rpc("recognition_quota_left");
  fail(error);
  return typeof data === "number" ? data : 0;
}

export const recognitionsQuery = (filter: RecognitionFilter = {}) =>
  queryOptions({
    queryKey: ["recognitions", filter.personId ?? "all", filter.limit ?? 20, filter.offset ?? 0],
    queryFn: () => fetchRecognitions(filter),
  });

export const recognitionQuotaQuery = (userId: string | null | undefined) =>
  queryOptions({
    queryKey: ["recognition-quota", userId ?? "anon"],
    queryFn: fetchRecognitionQuota,
    enabled: Boolean(userId),
  });

/** Danh sách đồng đội hợp lệ để ghi nhận (kiểm tra lại bằng hàm database). */
export async function fetchRecognizableMembers(): Promise<RecognitionPerson[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,avatar_path")
    .eq("status", "active")
    .order("display_name");
  fail(error);
  const people = (data ?? []) as RecognitionPerson[];
  const checks = await Promise.all(
    people.map(async (person) => {
      const { data: allowed } = await supabase.rpc("can_recognize", { _target: person.id });
      return allowed === true ? person : null;
    }),
  );
  return checks.filter((person): person is RecognitionPerson => person !== null);
}

export const recognizableMembersQuery = (userId: string | null | undefined) =>
  queryOptions({
    queryKey: ["recognizable-members", userId ?? "anon"],
    queryFn: fetchRecognizableMembers,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });

export async function createRecognition(input: {
  senderId: string;
  receiverId: string;
  category: RecognitionCategory;
  message: string;
}): Promise<void> {
  const { error } = await supabase.from("recognitions").insert({
    sender_id: input.senderId,
    receiver_id: input.receiverId,
    category: input.category,
    message: input.message.trim(),
  });
  fail(error);
}

export async function revokeRecognition(id: string): Promise<void> {
  const { error } = await supabase
    .from("recognitions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  fail(error);
}

export async function reportRecognition(input: {
  recognitionId: string;
  reporterId: string;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.from("recognition_reports").insert({
    recognition_id: input.recognitionId,
    reporter_id: input.reporterId,
    reason: input.reason.trim(),
  });
  fail(error);
}

/** Còn trong cửa sổ thu hồi 10 phút hay không (chỉ để hiển thị nút). */
export function canRevoke(row: RecognitionRow, userId: string | null): boolean {
  if (!userId || row.sender_id !== userId || row.revoked_at) return false;
  return Date.now() - new Date(row.created_at).getTime() < RECOGNITION_REVOKE_WINDOW_MS;
}
