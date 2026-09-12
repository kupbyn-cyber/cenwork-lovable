/**
 * CEN-AI-WRITE-01 — Ghi duyệt Báo cáo ngày cho hệ thống tự động hóa.
 *
 * Chỉ hỗ trợ một action cố định. Thao tác nghiệp vụ luôn chạy qua `withUser`
 * để RLS và trigger của PostgreSQL tiếp tục là ranh giới quyền cuối cùng.
 */
import { withUser } from "@/db/pool.server";
import { createPrivilegedDataClient } from "@/lib/db/server-client.server";

export const AI_ACT_ACTIONS = ["daily_report_review"] as const;
export const AI_ACT_DECISIONS = ["approved", "changes_requested"] as const;

type AiActDecision = (typeof AI_ACT_DECISIONS)[number];

export interface AiActRequest {
  action: unknown;
  report_id: unknown;
  decision: unknown;
  note: unknown;
}

interface AiActError {
  error: {
    code: string;
    message: string;
    allowed_values?: readonly string[];
  };
}

interface DailyReportReviewRow {
  id: string;
  status: AiActDecision;
  review_note: string;
  reviewer_id: string;
  reviewed_at: string;
}

interface AiActSuccess {
  action: "daily_report_review";
  data: {
    report_id: string;
    status: AiActDecision;
    review_note: string;
    reviewer_id: string;
    reviewed_at: string;
  };
}

export type AiActResult =
  { status: number; body: AiActSuccess } | { status: number; body: AiActError };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(
  status: number,
  code: string,
  message: string,
  allowedValues?: readonly string[],
): AiActResult {
  return {
    status,
    body: {
      error: {
        code,
        message,
        ...(allowedValues ? { allowed_values: allowedValues } : {}),
      },
    },
  };
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Cơ sở dữ liệu từ chối thao tác duyệt.";
}

export async function runAiAct(viewerId: string, request: AiActRequest): Promise<AiActResult> {
  if (request.action !== AI_ACT_ACTIONS[0]) {
    return failure(
      400,
      "INVALID_ACTION",
      `Action không hỗ trợ: ${String(request.action ?? "")}.`,
      AI_ACT_ACTIONS,
    );
  }

  if (!AI_ACT_DECISIONS.includes(request.decision as AiActDecision)) {
    return failure(
      400,
      "INVALID_DECISION",
      `Decision không hỗ trợ: ${String(request.decision ?? "")}.`,
      AI_ACT_DECISIONS,
    );
  }

  if (typeof request.report_id !== "string" || !UUID_RE.test(request.report_id)) {
    return failure(400, "INVALID_REPORT_ID", "report_id phải là UUID hợp lệ.");
  }

  if (typeof request.note !== "string" || request.note.trim() === "") {
    return failure(400, "NOTE_REQUIRED", "Bắt buộc nhập nhận xét khi duyệt báo cáo ngày.");
  }

  const reportId = request.report_id;
  const decision = request.decision as AiActDecision;

  try {
    const reviewed = await withUser(viewerId, async (client) => {
      const visible = await client.query<{ id: string }>(
        "SELECT id FROM public.daily_reports WHERE id = $1",
        [reportId],
      );
      if (visible.rowCount === 0) return { kind: "not_found" } as const;

      const updated = await client.query<DailyReportReviewRow>(
        `UPDATE public.daily_reports
            SET status = $2, review_note = $3
          WHERE id = $1
          RETURNING id, status::text AS status, review_note,
                    reviewer_id::text AS reviewer_id, reviewed_at::text AS reviewed_at`,
        [reportId, decision, request.note],
      );

      if (updated.rowCount === 0) return { kind: "forbidden" } as const;
      return { kind: "reviewed", row: updated.rows[0]! } as const;
    });

    if (reviewed.kind === "not_found") {
      return failure(
        404,
        "REPORT_NOT_FOUND",
        "Không tìm thấy báo cáo ngày trong phạm vi được phép.",
      );
    }
    if (reviewed.kind === "forbidden") {
      return failure(403, "FORBIDDEN", "Danh tính AI không có quyền duyệt báo cáo ngày này.");
    }

    return {
      status: 200,
      body: {
        action: "daily_report_review",
        data: {
          report_id: reviewed.row.id,
          status: reviewed.row.status,
          review_note: reviewed.row.review_note,
          reviewer_id: reviewed.row.reviewer_id,
          reviewed_at: reviewed.row.reviewed_at,
        },
      },
    };
  } catch (error) {
    const code = errorCodeOf(error);
    if (code === "P0001") {
      return failure(409, "REVIEW_REJECTED", errorMessageOf(error));
    }
    if (code === "42501") {
      return failure(403, "FORBIDDEN", "Danh tính AI không có quyền duyệt báo cáo ngày này.");
    }
    throw error;
  }
}

/** Audit chạy độc lập và không làm hỏng kết quả của thao tác nghiệp vụ. */
export async function logAiAct(
  viewerId: string,
  entry: {
    reportId: string;
    decision: string;
    outcome: "success" | "error";
    errorCode?: string;
  },
): Promise<void> {
  try {
    const admin = createPrivilegedDataClient();
    await admin.from("audit_logs").insert({
      user_id: viewerId,
      action: "ai.act",
      entity_type: "daily_report",
      entity_id: UUID_RE.test(entry.reportId) ? entry.reportId : null,
      metadata: {
        decision: entry.decision,
        outcome: entry.outcome,
        ...(entry.errorCode ? { errorCode: entry.errorCode } : {}),
      },
    });
  } catch (error) {
    console.error("[ai-act] audit:", errorMessageOf(error));
  }
}
