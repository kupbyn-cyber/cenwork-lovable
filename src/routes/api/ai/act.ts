/**
 * CEN-AI-WRITE-01 — POST /api/ai/act
 * Endpoint ghi phạm vi hẹp cho n8n duyệt hoặc yêu cầu sửa Báo cáo ngày.
 */
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/ai/act")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CEN_AI_READ_KEY"] ?? "";
        const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!expected || !safeEqual(expected, provided)) {
          return Response.json(
            { error: { code: "UNAUTHORIZED", message: "Thiếu hoặc sai API key." } },
            { status: 401 },
          );
        }

        const viewerId = (process.env["CEN_AI_VIEWER_USER_ID"] ?? "").trim();
        if (!viewerId) {
          return Response.json(
            {
              error: {
                code: "NOT_CONFIGURED",
                message: "Chưa cấu hình CEN_AI_VIEWER_USER_ID trên máy chủ.",
              },
            },
            { status: 500 },
          );
        }
        if (!process.env["DATABASE_URL"]) {
          return Response.json(
            {
              error: {
                code: "DB_NOT_CONFIGURED",
                message: "Máy chủ chưa kết nối cơ sở dữ liệu CEN (DATABASE_URL).",
              },
            },
            { status: 503 },
          );
        }

        let body: Record<string, unknown>;
        try {
          const parsed = (await request.json()) as unknown;
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("JSON object required");
          }
          body = parsed as Record<string, unknown>;
        } catch {
          return Response.json(
            { error: { code: "INVALID_BODY", message: "Body phải là JSON hợp lệ." } },
            { status: 400 },
          );
        }

        const { runAiAct, logAiAct } = await import("@/lib/ai-act.server");
        const payload = {
          action: body["action"],
          report_id: body["report_id"],
          decision: body["decision"],
          note: body["note"],
        };

        let result;
        try {
          result = await runAiAct(viewerId, payload);
        } catch (error) {
          console.error("[ai-act]", (error as Error).message);
          result = {
            status: 500,
            body: { error: { code: "INTERNAL_ERROR", message: "Không duyệt được báo cáo ngày." } },
          } as const;
        }

        const success = "data" in result.body;
        await logAiAct(viewerId, {
          reportId: typeof payload.report_id === "string" ? payload.report_id : "",
          decision: typeof payload.decision === "string" ? payload.decision : "",
          outcome: success ? "success" : "error",
          ...(success
            ? {}
            : { errorCode: (result.body as { error: { code: string } }).error.code }),
        });

        return Response.json(result.body, {
          status: result.status,
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
