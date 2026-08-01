import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  obligationState,
  type ObligationState,
  type ReportKind,
  type ReportObligationRow,
} from "@/lib/report-obligation-data";

/**
 * CEN 1.0 — REPORT-03: thống kê và lưu trữ báo cáo.
 * Số liệu suy ra từ `report_obligations` (nguồn sự thật về nghĩa vụ) — không tạo bảng song song.
 * Quyền xem do RLS quyết định: Member thấy của mình, Leader thấy Team, CMO/Admin thấy toàn bộ.
 */

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export interface ReportStatsFilter {
  from: string;
  to: string;
  reportType: ReportKind | null;
  teamId: string | null;
  userId: string | null;
}

export interface ReportStatsSummary {
  total: number;
  submitted: number;
  lateSubmitted: number;
  pending: number;
  overdue: number;
  upcoming: number;
  exempt: number;
  /** Tỷ lệ gửi đúng hạn trên tổng nghĩa vụ tính điểm (không tính miễn / chưa đến hạn). */
  onTimeRate: number;
  complianceRate: number;
}

export interface ReportStatsGroup extends ReportStatsSummary {
  key: string;
  label: string;
}

const COUNTED: ObligationState[] = ["submitted", "late_submitted", "pending", "overdue"];

export function filterObligations(
  rows: ReportObligationRow[],
  filter: ReportStatsFilter,
): ReportObligationRow[] {
  return rows.filter((row) => {
    const day = row.due_at.slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (filter.reportType && row.report_type !== filter.reportType) return false;
    if (filter.teamId && row.team_id !== filter.teamId) return false;
    if (filter.userId && row.user_id !== filter.userId) return false;
    return true;
  });
}

export function summarizeObligations(
  rows: ReportObligationRow[],
  now: number = Date.now(),
): ReportStatsSummary {
  const summary: ReportStatsSummary = {
    total: rows.length,
    submitted: 0,
    lateSubmitted: 0,
    pending: 0,
    overdue: 0,
    upcoming: 0,
    exempt: 0,
    onTimeRate: 0,
    complianceRate: 0,
  };
  for (const row of rows) {
    const state = obligationState(row, now);
    if (state === "submitted") summary.submitted += 1;
    else if (state === "late_submitted") summary.lateSubmitted += 1;
    else if (state === "pending") summary.pending += 1;
    else if (state === "overdue") summary.overdue += 1;
    else if (state === "upcoming") summary.upcoming += 1;
    else summary.exempt += 1;
  }
  const counted = COUNTED.reduce((acc, state) => {
    if (state === "submitted") return acc + summary.submitted;
    if (state === "late_submitted") return acc + summary.lateSubmitted;
    if (state === "pending") return acc + summary.pending;
    return acc + summary.overdue;
  }, 0);
  if (counted > 0) {
    summary.onTimeRate = summary.submitted / counted;
    summary.complianceRate = (summary.submitted + summary.lateSubmitted) / counted;
  }
  return summary;
}

export function groupObligations(
  rows: ReportObligationRow[],
  by: "team" | "person" | "type",
  now: number = Date.now(),
): ReportStatsGroup[] {
  const buckets = new Map<string, { label: string; rows: ReportObligationRow[] }>();
  for (const row of rows) {
    const key =
      by === "team"
        ? (row.team_id ?? "no-team")
        : by === "person"
          ? row.user_id
          : row.report_type;
    const label =
      by === "team"
        ? (row.teamName ?? "Chưa thuộc Team")
        : by === "person"
          ? (row.userName ?? "Không rõ")
          : row.report_type;
    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(row);
    else buckets.set(key, { label, rows: [row] });
  }
  return Array.from(buckets.entries())
    .map(([key, bucket]) => ({ key, label: bucket.label, ...summarizeObligations(bucket.rows, now) }))
    .sort((a, b) => b.overdue - a.overdue || b.total - a.total);
}

/* ================= Lưu trữ / xóa mềm ================= */

export interface ReportArchiveRow {
  id: string;
  report_type: ReportKind;
  period_key: string;
  author_id: string;
  authorName: string | null;
  teamName: string | null;
  projectName: string | null;
  status: string;
  archived_at: string | null;
  archive_reason: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  updated_at: string;
}

async function fetchArchive(): Promise<ReportArchiveRow[]> {
  const { data, error } = await supabase
    .from("reports")
    .select(
      `id,report_type,period_key,author_id,status,archived_at,archive_reason,deleted_at,delete_reason,updated_at,
       author:profiles!reports_author_id_fkey(display_name),team:teams(name),project:projects(name)`,
    )
    .or("archived_at.not.is.null,deleted_at.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(300);
  fail(error);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const author = row["author"] as { display_name: string } | null;
    const team = row["team"] as { name: string } | null;
    const project = row["project"] as { name: string } | null;
    return {
      id: row["id"] as string,
      report_type: row["report_type"] as ReportKind,
      period_key: row["period_key"] as string,
      author_id: row["author_id"] as string,
      authorName: author?.display_name ?? null,
      teamName: team?.name ?? null,
      projectName: project?.name ?? null,
      status: row["status"] as string,
      archived_at: (row["archived_at"] as string | null) ?? null,
      archive_reason: (row["archive_reason"] as string | null) ?? null,
      deleted_at: (row["deleted_at"] as string | null) ?? null,
      delete_reason: (row["delete_reason"] as string | null) ?? null,
      updated_at: row["updated_at"] as string,
    };
  });
}

export const reportArchiveQuery = () =>
  queryOptions({ queryKey: ["report-archive"], queryFn: fetchArchive });

export async function setReportArchived(reportId: string, archived: boolean, reason: string | null) {
  const { error } = await supabase.rpc("report_set_archived", {
    _report: reportId,
    _archived: archived,
    ...(reason ? { _reason: reason } : {}),
  });
  fail(error);
}

export async function softDeleteReport(reportId: string, reason: string) {
  const { error } = await supabase.rpc("report_soft_delete", { _report: reportId, _reason: reason });
  fail(error);
}

export async function restoreReport(reportId: string, reason: string) {
  const { error } = await supabase.rpc("report_restore", { _report: reportId, _reason: reason });
  fail(error);
}
