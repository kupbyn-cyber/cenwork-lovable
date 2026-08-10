/**
 * CEN-MB-02 — Cầu nối giữa lớp gọi dữ liệu ở trình duyệt và PostgreSQL.
 * File này chỉ chứa khai báo server function (yêu cầu của TanStack Start).
 */
import { createServerFn } from "@tanstack/react-start";

import type { QueryPlan, DbWireResponse, RpcPlan } from "@/lib/db/query-plan";

export const cenDbQuery = createServerFn({ method: "POST" })
  .inputValidator((input: QueryPlan) => {
    if (!input || typeof input.table !== "string") throw new Error("Query plan không hợp lệ.");
    return input;
  })
  .handler(async ({ data }): Promise<DbWireResponse> => {
    const { runQueryPlan } = await import("@/lib/db/executor.server");
    return runQueryPlan(data);
  });

export const cenDbRpc = createServerFn({ method: "POST" })
  .inputValidator((input: RpcPlan) => {
    if (!input || typeof input.fn !== "string") throw new Error("Lời gọi function không hợp lệ.");
    return input;
  })
  .handler(async ({ data }): Promise<DbWireResponse> => {
    const { runRpcPlan } = await import("@/lib/db/executor.server");
    return runRpcPlan(data);
  });