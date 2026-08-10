import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";

/**
 * CEN WORK — M5 ánh xạ Telegram.
 * Mô hình chuẩn: một Bot chung, một Group Chat chung, mỗi Team một Topic Thread ID,
 * mỗi thành viên một Telegram User ID.
 * Nguồn dữ liệu duy nhất: profiles (cá nhân), teams (topic), telegram_config (bot + group).
 * Bot Token không bao giờ xuất hiện ở client: đọc/ghi qua server function.
 */
export type DeliveryStatus = "pending" | "sent" | "failed";

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: "Chờ gửi",
  sent: "Đã gửi",
  failed: "Thất bại",
};

export const DELIVERY_STATUS_TONE: Record<DeliveryStatus, "warning" | "success" | "error"> = {
  pending: "warning",
  sent: "success",
  failed: "error",
};

export type OutboxMessageType = "daily_report" | "notification";

export const MESSAGE_TYPE_LABEL: Record<string, string> = {
  daily_report: "Báo cáo ngày",
  notification: "Thông báo cá nhân",
};

export interface TelegramOutboxRow {
  id: string;
  target_type: string;
  target_id: string | null;
  chat_id: string;
  topic_id: string | null;
  message: string;
  status: DeliveryStatus;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  message_type: string;
  report_id: string | null;
  telegram_message_id: string | null;
}

export interface TelegramMemberRow {
  id: string;
  display_name: string;
  email: string;
  telegram_user_id: string | null;
  telegram_enabled: boolean;
  primary_team_id: string | null;
}

export interface TelegramTeamRow {
  id: string;
  name: string;
  telegram_topic_id: string | null;
  telegram_enabled: boolean;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Che bớt Chat ID khi hiển thị để hạn chế lộ định danh kênh. */
export function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return "••••";
  return `${chatId.slice(0, 2)}••••${chatId.slice(-3)}`;
}

export async function fetchTelegramMembers(): Promise<TelegramMemberRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,email,telegram_user_id,telegram_enabled,primary_team_id")
    .order("display_name");
  fail(error);
  return (data ?? []) as TelegramMemberRow[];
}

export async function fetchTelegramTeams(): Promise<TelegramTeamRow[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id,name,telegram_topic_id,telegram_enabled")
    .order("name");
  fail(error);
  return (data ?? []) as TelegramTeamRow[];
}

export async function fetchOutbox(limit = 50): Promise<TelegramOutboxRow[]> {
  const { data, error } = await supabase
    .from("telegram_outbox")
    .select(
      "id,target_type,target_id,chat_id,topic_id,message,status,attempts,last_error,sent_at,created_at,message_type,report_id,telegram_message_id",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  fail(error);
  return (data ?? []) as TelegramOutboxRow[];
}

/** Cập nhật ánh xạ Telegram cá nhân (RLS quyết định ai được sửa hồ sơ nào). */
export async function saveMemberTelegram(input: {
  userId: string;
  telegramUserId: string | null;
  enabled: boolean;
}) {
  const { error } = await supabase
    .from("profiles")
    .update({
      telegram_user_id: input.telegramUserId?.trim() || null,
      telegram_enabled: input.enabled,
    })
    .eq("id", input.userId);
  fail(error);
}

/** Cập nhật Topic Thread ID của Team (RLS: chỉ Admin). */
export async function saveTeamTelegram(input: {
  teamId: string;
  topicId: string | null;
  enabled: boolean;
}) {
  const { error } = await supabase
    .from("teams")
    .update({
      telegram_topic_id: input.topicId?.trim() || null,
      telegram_enabled: input.enabled,
    })
    .eq("id", input.teamId);
  fail(error);
}

export function telegramMembersQuery(enabled: boolean) {
  return queryOptions({
    queryKey: ["telegram-members"],
    queryFn: fetchTelegramMembers,
    enabled,
  });
}

export function telegramTeamsQuery(enabled: boolean) {
  return queryOptions({
    queryKey: ["telegram-teams"],
    queryFn: fetchTelegramTeams,
    enabled,
  });
}

export function telegramOutboxQuery(enabled: boolean) {
  return queryOptions({
    queryKey: ["telegram-outbox"],
    queryFn: () => fetchOutbox(),
    enabled,
  });
}
