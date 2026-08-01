import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  MVP_CRITERION_MAX,
  type MvpAwardStatus,
  type MvpAwardType,
  type MvpCriterion,
  type MvpCycleStatus,
  type MvpReviewStatus,
  type MvpScorecardStatus,
} from "@/lib/mvp-scoring";

/**
 * CEN 1.0 — M6 MVP data layer.
 * Đọc/ghi qua phiên người dùng; RLS và trigger phía database là ràng buộc thật.
 * Danh tính người bỏ phiếu không bao giờ được truy vấn ở đây ngoài phiếu của chính mình.
 */

export interface MvpCycleRow {
  id: string;
  week_start: string;
  week_end: string;
  status: MvpCycleStatus;
  vote_opens_at: string | null;
  vote_closes_at: string | null;
  data_locked_at: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
}

export async function fetchCycles(): Promise<MvpCycleRow[]> {
  const { data, error } = await supabase
    .from("mvp_cycles")
    .select(
      "id,week_start,week_end,status,vote_opens_at,vote_closes_at,data_locked_at,published_at,published_by,created_at",
    )
    .order("week_start", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return (data ?? []) as MvpCycleRow[];
}

export const mvpCyclesQuery = () =>
  queryOptions({ queryKey: ["mvp-cycles"], queryFn: fetchCycles });

export async function fetchCycle(cycleId: string): Promise<MvpCycleRow | null> {
  const { data, error } = await supabase
    .from("mvp_cycles")
    .select(
      "id,week_start,week_end,status,vote_opens_at,vote_closes_at,data_locked_at,published_at,published_by,created_at",
    )
    .eq("id", cycleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MvpCycleRow | null) ?? null;
}

export const mvpCycleQuery = (cycleId: string) =>
  queryOptions({ queryKey: ["mvp-cycle", cycleId], queryFn: () => fetchCycle(cycleId) });

/* ================= Bảng điểm ================= */

export interface MvpScorecardRow {
  id: string;
  cycle_id: string;
  user_id: string;
  userName: string | null;
  team_id: string | null;
  teamName: string | null;
  auto_score: number;
  review_score: number;
  vote_score: number;
  penalty_score: number;
  total_score: number;
  data_completeness: number;
  is_eligible: boolean;
  ineligible_reason: string | null;
  status: MvpScorecardStatus;
  computed_at: string | null;
}

const SCORECARD_SELECT = `
  id,cycle_id,user_id,team_id,auto_score,review_score,vote_score,penalty_score,total_score,
  data_completeness,is_eligible,ineligible_reason,status,computed_at,
  member:profiles!mvp_scorecards_user_id_fkey(id,display_name),
  team:teams(id,name)
`;

function mapScorecard(raw: Record<string, unknown>): MvpScorecardRow {
  const member = raw["member"] as { display_name: string } | null;
  const team = raw["team"] as { name: string } | null;
  return {
    id: raw["id"] as string,
    cycle_id: raw["cycle_id"] as string,
    user_id: raw["user_id"] as string,
    userName: member?.display_name ?? null,
    team_id: (raw["team_id"] as string | null) ?? null,
    teamName: team?.name ?? null,
    auto_score: Number(raw["auto_score"] ?? 0),
    review_score: Number(raw["review_score"] ?? 0),
    vote_score: Number(raw["vote_score"] ?? 0),
    penalty_score: Number(raw["penalty_score"] ?? 0),
    total_score: Number(raw["total_score"] ?? 0),
    data_completeness: Number(raw["data_completeness"] ?? 0),
    is_eligible: Boolean(raw["is_eligible"]),
    ineligible_reason: (raw["ineligible_reason"] as string | null) ?? null,
    status: raw["status"] as MvpScorecardStatus,
    computed_at: (raw["computed_at"] as string | null) ?? null,
  };
}

export async function fetchScorecards(cycleId: string): Promise<MvpScorecardRow[]> {
  const { data, error } = await supabase
    .from("mvp_scorecards")
    .select(SCORECARD_SELECT)
    .eq("cycle_id", cycleId)
    .order("total_score", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapScorecard(row as Record<string, unknown>));
}

export const mvpScorecardsQuery = (cycleId: string) =>
  queryOptions({ queryKey: ["mvp-scorecards", cycleId], queryFn: () => fetchScorecards(cycleId) });

/* ================= Thành phần điểm ================= */

export interface MvpComponentRow {
  id: string;
  user_id: string;
  criterion: MvpCriterion;
  max_points: number;
  earned_points: number;
  formula: string | null;
  source_data: Record<string, unknown>;
  is_applicable: boolean;
  not_applicable_reason: string | null;
}

export async function fetchComponents(
  cycleId: string,
  userId: string,
): Promise<MvpComponentRow[]> {
  const { data, error } = await supabase
    .from("mvp_score_components")
    .select(
      "id,user_id,criterion,max_points,earned_points,formula,source_data,is_applicable,not_applicable_reason",
    )
    .eq("cycle_id", cycleId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((raw) => ({
    ...(raw as unknown as MvpComponentRow),
    max_points: Number((raw as Record<string, unknown>)["max_points"] ?? 0),
    earned_points: Number((raw as Record<string, unknown>)["earned_points"] ?? 0),
    source_data: ((raw as Record<string, unknown>)["source_data"] ?? {}) as Record<string, unknown>,
  }));
  const order = Object.keys(MVP_CRITERION_MAX);
  return rows.sort((a, b) => order.indexOf(a.criterion) - order.indexOf(b.criterion));
}

export const mvpComponentsQuery = (cycleId: string, userId: string | null) =>
  queryOptions({
    queryKey: ["mvp-components", cycleId, userId],
    queryFn: () => fetchComponents(cycleId, userId as string),
    enabled: Boolean(userId),
  });

/* ================= Công việc trong kỳ ================= */

export interface MvpCycleTaskRow {
  id: string;
  task_id: string;
  user_id: string;
  userName: string | null;
  taskName: string;
  taskStatus: string;
  weight: number;
  original_deadline: string | null;
  is_committed: boolean;
  is_locked: boolean;
}

export async function fetchCycleTasks(cycleId: string): Promise<MvpCycleTaskRow[]> {
  const { data, error } = await supabase
    .from("mvp_cycle_tasks")
    .select(
      `id,task_id,user_id,weight,original_deadline,is_committed,is_locked,
       task:tasks(id,name,status),
       member:profiles!mvp_cycle_tasks_user_id_fkey(id,display_name)`,
    )
    .eq("cycle_id", cycleId)
    .order("weight", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const task = row["task"] as { name: string; status: string } | null;
    const member = row["member"] as { display_name: string } | null;
    return {
      id: row["id"] as string,
      task_id: row["task_id"] as string,
      user_id: row["user_id"] as string,
      userName: member?.display_name ?? null,
      taskName: task?.name ?? "—",
      taskStatus: task?.status ?? "—",
      weight: Number(row["weight"] ?? 1),
      original_deadline: (row["original_deadline"] as string | null) ?? null,
      is_committed: Boolean(row["is_committed"]),
      is_locked: Boolean(row["is_locked"]),
    };
  });
}

export const mvpCycleTasksQuery = (cycleId: string) =>
  queryOptions({ queryKey: ["mvp-cycle-tasks", cycleId], queryFn: () => fetchCycleTasks(cycleId) });

export async function updateCycleTaskWeight(id: string, weight: number) {
  const { error } = await supabase.from("mvp_cycle_tasks").update({ weight }).eq("id", id);
  if (error) throw new Error(error.message);
}

/* ================= Đánh giá thực tế ================= */

export interface MvpReviewRow {
  id: string;
  cycle_id: string;
  subject_id: string;
  subjectName: string | null;
  reviewer_id: string;
  quality_score: number;
  proactive_score: number;
  teamwork_score: number;
  reason: string | null;
  evidence: string | null;
  status: MvpReviewStatus;
  submitted_at: string | null;
}

export async function fetchReviews(cycleId: string): Promise<MvpReviewRow[]> {
  const { data, error } = await supabase
    .from("mvp_manual_reviews")
    .select(
      `id,cycle_id,subject_id,reviewer_id,quality_score,proactive_score,teamwork_score,
       reason,evidence,status,submitted_at,
       subject:profiles!mvp_manual_reviews_subject_id_fkey(id,display_name)`,
    )
    .eq("cycle_id", cycleId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const subject = row["subject"] as { display_name: string } | null;
    return {
      id: row["id"] as string,
      cycle_id: row["cycle_id"] as string,
      subject_id: row["subject_id"] as string,
      subjectName: subject?.display_name ?? null,
      reviewer_id: row["reviewer_id"] as string,
      quality_score: Number(row["quality_score"] ?? 0),
      proactive_score: Number(row["proactive_score"] ?? 0),
      teamwork_score: Number(row["teamwork_score"] ?? 0),
      reason: (row["reason"] as string | null) ?? null,
      evidence: (row["evidence"] as string | null) ?? null,
      status: row["status"] as MvpReviewStatus,
      submitted_at: (row["submitted_at"] as string | null) ?? null,
    };
  });
}

export const mvpReviewsQuery = (cycleId: string) =>
  queryOptions({ queryKey: ["mvp-reviews", cycleId], queryFn: () => fetchReviews(cycleId) });

export interface SaveReviewInput {
  cycleId: string;
  subjectId: string;
  reviewerId: string;
  quality: number;
  proactive: number;
  teamwork: number;
  reason: string;
  evidence: string;
  submit: boolean;
  existingId?: string | undefined;
}

export async function saveReview(input: SaveReviewInput) {
  const payload = {
    cycle_id: input.cycleId,
    subject_id: input.subjectId,
    reviewer_id: input.reviewerId,
    quality_score: input.quality,
    proactive_score: input.proactive,
    teamwork_score: input.teamwork,
    reason: input.reason || null,
    evidence: input.evidence || null,
    status: (input.submit ? "submitted" : "draft") as MvpReviewStatus,
  };
  const query = input.existingId
    ? supabase.from("mvp_manual_reviews").update(payload).eq("id", input.existingId)
    : supabase.from("mvp_manual_reviews").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/* ================= Phiếu bầu ================= */

export interface MyVoteRow {
  id: string;
  votee_id: string;
  reason: string;
  created_at: string;
}

export async function fetchMyVote(cycleId: string, userId: string): Promise<MyVoteRow | null> {
  const { data, error } = await supabase
    .from("mvp_votes")
    .select("id,votee_id,reason,created_at")
    .eq("cycle_id", cycleId)
    .eq("voter_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MyVoteRow | null) ?? null;
}

export const myVoteQuery = (cycleId: string, userId: string | null) =>
  queryOptions({
    queryKey: ["mvp-my-vote", cycleId, userId],
    queryFn: () => fetchMyVote(cycleId, userId as string),
    enabled: Boolean(userId),
  });

export async function castVote(input: {
  cycleId: string;
  voterId: string;
  voteeId: string;
  reason: string;
}) {
  const { error } = await supabase.from("mvp_votes").insert({
    cycle_id: input.cycleId,
    voter_id: input.voterId,
    votee_id: input.voteeId,
    reason: input.reason,
  });
  if (error) throw new Error(error.message);
}

/* ================= Danh hiệu ================= */

export interface MvpAwardRow {
  id: string;
  cycle_id: string;
  award_type: MvpAwardType;
  recipient_id: string | null;
  recipientName: string | null;
  recipientTeam: string | null;
  award_score: number | null;
  reason: string | null;
  status: MvpAwardStatus;
  approved_at: string | null;
  published_at: string | null;
}

export async function fetchAwards(cycleId: string): Promise<MvpAwardRow[]> {
  const { data, error } = await supabase
    .from("mvp_award_results")
    .select(
      `id,cycle_id,award_type,recipient_id,award_score,reason,status,approved_at,published_at,
       recipient:profiles!mvp_award_results_recipient_id_fkey(id,display_name,teams:primary_team_id(name))`,
    )
    .eq("cycle_id", cycleId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const recipient = row["recipient"] as
      | { display_name: string; teams: { name: string } | null }
      | null;
    return {
      id: row["id"] as string,
      cycle_id: row["cycle_id"] as string,
      award_type: row["award_type"] as MvpAwardType,
      recipient_id: (row["recipient_id"] as string | null) ?? null,
      recipientName: recipient?.display_name ?? null,
      recipientTeam: recipient?.teams?.name ?? null,
      award_score: row["award_score"] === null ? null : Number(row["award_score"]),
      reason: (row["reason"] as string | null) ?? null,
      status: row["status"] as MvpAwardStatus,
      approved_at: (row["approved_at"] as string | null) ?? null,
      published_at: (row["published_at"] as string | null) ?? null,
    };
  });
}

export const mvpAwardsQuery = (cycleId: string) =>
  queryOptions({ queryKey: ["mvp-awards", cycleId], queryFn: () => fetchAwards(cycleId) });
