import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * CEN 1.0 — M5 mapping Telegram và hàng đợi gửi (chỉ Admin, RLS chốt phạm vi).
 * Bot Token không bao giờ xuất hiện ở client: việc gửi thực hiện ở server function.
 */
export interface TelegramUserLinkRow {
  id: string;
  user_id: string;
  chat_id: string;
  is_active: boolean;
  updated_at: string;
}

export interface TelegramTeamLinkRow {
  id: string;
  team_id: string;
  chat_id: string;
  topic_id: string | null;
  is_active: boolean;
  updated_at: string;
}

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
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Che bớt Chat ID khi hiển thị để hạn chế lộ định danh kênh. */
export function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return "••••";
  return `${chatId.slice(0, 2)}••••${chatId.slice(-3)}`;
}

export async function fetchUserLinks(): Promise<TelegramUserLinkRow[]> {
  const { data, error } = await supabase
    .from("telegram_user_links")
    .select("id,user_id,chat_id,is_active,updated_at")
    .order("updated_at", { ascending: false });
  fail(error);
  return (data ?? []) as TelegramUserLinkRow[];
}

export async function fetchTeamLinks(): Promise<TelegramTeamLinkRow[]> {
  const { data, error } = await supabase
    .from("telegram_team_links")
    .select("id,team_id,chat_id,topic_id,is_active,updated_at")
    .order("updated_at", { ascending: false });
  fail(error);
  return (data ?? []) as TelegramTeamLinkRow[];
}

export async function fetchOutbox(limit = 50): Promise<TelegramOutboxRow[]> {
  const { data, error } = await supabase
    .from("telegram_outbox")
    .select(
      "id,target_type,target_id,chat_id,topic_id,message,status,attempts,last_error,sent_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  fail(error);
  return (data ?? []) as TelegramOutboxRow[];
}

export async function upsertUserLink(input: {
  userId: string;
  chatId: string;
  isActive: boolean;
}) {
  const { error } = await supabase.from("telegram_user_links").upsert(
    {
      user_id: input.userId,
      chat_id: input.chatId.trim(),
      is_active: input.isActive,
    },
    { onConflict: "user_id" },
  );
  fail(error);
}

export async function upsertTeamLink(input: {
  teamId: string;
  chatId: string;
  topicId: string | null;
  isActive: boolean;
}) {
  const { error } = await supabase.from("telegram_team_links").upsert(
    {
      team_id: input.teamId,
      chat_id: input.chatId.trim(),
      topic_id: input.topicId,
      is_active: input.isActive,
    },
    { onConflict: "team_id" },
  );
  fail(error);
}

export async function deleteUserLink(id: string) {
  const { error } = await supabase.from("telegram_user_links").delete().eq("id", id);
  fail(error);
}

export async function deleteTeamLink(id: string) {
  const { error } = await supabase.from("telegram_team_links").delete().eq("id", id);
  fail(error);
}

export function telegramUserLinksQuery(enabled: boolean) {
  return queryOptions({
    queryKey: ["telegram-user-links"],
    queryFn: fetchUserLinks,
    enabled,
  });
}

export function telegramTeamLinksQuery(enabled: boolean) {
  return queryOptions({
    queryKey: ["telegram-team-links"],
    queryFn: fetchTeamLinks,
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
