import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * CEN TODAY-02 — Ghi nhận đồng đội (data layer).
 * Mọi ràng buộc thật (quan hệ làm việc, hạn mức 3 lượt/ngày, cửa sổ thu hồi 10 phút)
 * nằm ở RLS và trigger database; lớp này chỉ đọc/ghi và hiển thị thông báo lỗi.
 */
export type RecognitionCategory = Database["public"]["Enums"]["recognition_category"];

/** Nhận diện trực quan cho từng loại ghi nhận (Forest Command, sắc độ nhẹ). */
export interface RecognitionCategoryMeta {
  label: string;
  emoji: string;
  /** Class Tailwind dùng token thiết kế, không hardcode màu. */
  tone: string;
  hint: string;
}

export const RECOGNITION_CATEGORY_META: Record<RecognitionCategory, RecognitionCategoryMeta> = {
  teamwork: {
    label: "Đồng đội",
    emoji: "🤝",
    tone: "border-brand-secondary bg-brand-subtle text-text-primary",
    hint: "Sát cánh, hỗ trợ nhau hoàn thành việc chung.",
  },
  initiative: {
    label: "Chủ động",
    emoji: "⚡",
    tone: "border-state-info/35 bg-state-info-surface text-state-info",
    hint: "Tự nhận việc, không chờ được nhắc.",
  },
  creativity: {
    label: "Sáng tạo",
    emoji: "💡",
    tone: "border-state-warning/35 bg-state-warning-surface text-state-warning",
    hint: "Có ý tưởng hoặc cách làm mới hiệu quả.",
  },
  effectiveness: {
    label: "Hiệu quả",
    emoji: "🎯",
    tone: "border-state-success/35 bg-state-success-surface text-state-success",
    hint: "Kết quả rõ ràng, đúng hạn, đúng mục tiêu.",
  },
  progress: {
    label: "Tiến bộ",
    emoji: "🌱",
    tone: "border-state-success/35 bg-state-success-surface text-state-success",
    hint: "Tiến bộ rõ rệt so với trước đây.",
  },
  dedication: {
    label: "Hết mình",
    emoji: "🔥",
    tone: "border-state-danger/40 bg-state-danger-surface text-state-danger",
    hint: "Nỗ lực hết sức vì công việc chung.",
  },
  // Các loại cũ giữ lại để hiển thị dữ liệu lịch sử.
  support: {
    label: "Hỗ trợ kịp thời",
    emoji: "🤝",
    tone: "border-border-default bg-state-neutral-surface text-text-secondary",
    hint: "Hỗ trợ kịp thời (loại cũ).",
  },
  quality: {
    label: "Chất lượng công việc",
    emoji: "🎯",
    tone: "border-border-default bg-state-neutral-surface text-text-secondary",
    hint: "Chất lượng công việc (loại cũ).",
  },
  speed: {
    label: "Tốc độ xử lý",
    emoji: "⚡",
    tone: "border-border-default bg-state-neutral-surface text-text-secondary",
    hint: "Tốc độ xử lý (loại cũ).",
  },
};

export const RECOGNITION_CATEGORY_LABEL: Record<RecognitionCategory, string> = Object.fromEntries(
  Object.entries(RECOGNITION_CATEGORY_META).map(([key, meta]) => [key, meta.label]),
) as Record<RecognitionCategory, string>;

/** Sáu loại được phép chọn khi tạo mới. */
export const RECOGNITION_CATEGORY_ORDER: RecognitionCategory[] = [
  "teamwork",
  "initiative",
  "creativity",
  "effectiveness",
  "progress",
  "dedication",
];

export const RECOGNITION_REACTIONS = ["❤️", "👏", "🔥", "💚"] as const;
export type RecognitionReactionEmoji = (typeof RECOGNITION_REACTIONS)[number];

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

/** Người nhận trong bộ chọn — chỉ các trường nhận diện cơ bản. */
export interface RecognitionDirectoryPerson extends RecognitionPerson {
  job_title: string | null;
  primary_team_id: string | null;
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

/**
 * Danh sách người có thể ghi nhận (kiểm tra lại bằng hàm database).
 * Bao gồm chính người dùng hiện tại — tự ghi nhận được phép.
 */
export async function fetchRecognizableMembers(): Promise<RecognitionPerson[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,avatar_path")
    .eq("status", "active")
    .is("locked_at", null)
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

/* ------------------------------------------------------------------ */
/* RECOGNITION-01 — tự ghi nhận, reaction và thống kê Team              */
/* ------------------------------------------------------------------ */

/** Bản ghi tự ghi nhận: người gửi và người nhận là cùng một tài khoản. */
export function isSelfRecognition(row: Pick<RecognitionRow, "sender_id" | "receiver_id">): boolean {
  return row.sender_id === row.receiver_id;
}

export interface RecognitionReactionRow {
  recognition_id: string;
  user_id: string;
  emoji: string;
}

/** Toàn bộ reaction của các lời ghi nhận đang hiển thị (RLS lọc phạm vi xem). */
export async function fetchRecognitionReactions(
  recognitionIds: string[],
): Promise<RecognitionReactionRow[]> {
  if (recognitionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("recognition_reactions")
    .select("recognition_id,user_id,emoji")
    .in("recognition_id", recognitionIds);
  fail(error);
  return (data ?? []) as RecognitionReactionRow[];
}

export const recognitionReactionsQuery = (recognitionIds: string[]) =>
  queryOptions({
    queryKey: ["recognition-reactions", [...recognitionIds].sort().join(",")],
    queryFn: () => fetchRecognitionReactions(recognitionIds),
    enabled: recognitionIds.length > 0,
  });

/**
 * Thêm, đổi hoặc bỏ reaction. Quy tắc "một người một reaction" và chặn tài khoản
 * khóa đều nằm ở database (unique index + hàm SECURITY DEFINER).
 */
export async function reactToRecognition(
  recognitionId: string,
  emoji: RecognitionReactionEmoji | null,
): Promise<void> {
  const { error } = await supabase.rpc("recognition_react", {
    _recognition: recognitionId,
    _emoji: emoji as unknown as string,
  });
  fail(error);
}

/** Gộp reaction theo emoji cho một lời ghi nhận. */
export function summarizeReactions(
  rows: RecognitionReactionRow[],
  recognitionId: string,
  userId: string | null,
): { counts: Record<string, number>; mine: string | null } {
  const counts: Record<string, number> = {};
  let mine: string | null = null;
  for (const row of rows) {
    if (row.recognition_id !== recognitionId) continue;
    counts[row.emoji] = (counts[row.emoji] ?? 0) + 1;
    if (userId && row.user_id === userId) mine = row.emoji;
  }
  return { counts, mine };
}

export interface RecognitionTeamPulse {
  team_id: string | null;
  team_name: string | null;
  total_count: number;
  self_count: number;
  peer_recognized_members: number;
  active_members: number;
  missing_members: number;
}

/** Thống kê tuần theo Team; tự ghi nhận không tính vào "được đồng đội ghi nhận". */
export async function fetchRecognitionTeamPulse(
  teamId?: string | null,
): Promise<RecognitionTeamPulse | null> {
  const { data, error } = await supabase.rpc("recognition_team_pulse", {
    ...(teamId ? { _team: teamId } : {}),
  });
  fail(error);
  const rows = (data ?? []) as RecognitionTeamPulse[];
  return rows[0] ?? null;
}

export const recognitionTeamPulseQuery = (teamId?: string | null) =>
  queryOptions({
    queryKey: ["recognition-team-pulse", teamId ?? "mine"],
    queryFn: () => fetchRecognitionTeamPulse(teamId),
  });
