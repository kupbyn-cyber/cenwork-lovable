/**
 * CEN-AI-READ-01 — POST /api/ai/read
 * Endpoint đọc dữ liệu (read-only) cho GPT "CEN Analyst".
 * Xác thực bằng Bearer CEN_AI_READ_KEY; truy vấn chạy dưới danh tính
 * CEN_AI_VIEWER_USER_ID nên RLS/phân quyền hiện có vẫn là ranh giới cuối cùng.
 */
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/ai/read")({
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

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json(
            { error: { code: "INVALID_BODY", message: "Body phải là JSON hợp lệ." } },
            { status: 400 },
          );
        }

        const { runAiRead, logAiRead } = await import("@/lib/ai-read.server");
        const payload = {
          resource: String(body["resource"] ?? ""),
          filters: (body["filters"] ?? {}) as Record<string, unknown>,
          sort: (body["sort"] ?? null) as { field?: string; direction?: string } | null,
          limit: body["limit"] as number | undefined,
          offset: body["offset"] as number | undefined,
        };

        let result;
        try {
          result = await runAiRead(viewerId, payload);
        } catch (error) {
          console.error("[ai-read]", (error as Error).message);
          result = {
            status: 500,
            body: { error: { code: "INTERNAL_ERROR", message: "Không đọc được dữ liệu." } },
          } as const;
        }

        const success = "data" in result.body;
        await logAiRead(viewerId, {
          resource: payload.resource,
          filters: Object.keys(payload.filters ?? {}),
          limit: Number(payload.limit ?? 100),
          offset: Number(payload.offset ?? 0),
          outcome: success ? "success" : "error",
          returned: success ? (result.body as { data: unknown[] }).data.length : 0,
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