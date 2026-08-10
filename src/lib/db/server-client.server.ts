/**
 * CEN-MB-03 — Client dữ liệu chạy thẳng trên PostgreSQL ở phía máy chủ.
 *
 * Dùng cho server function: cùng API `from()/rpc()` như phía trình duyệt,
 * nhưng không đi vòng qua HTTP. Danh tính do máy chủ tự xác định
 * (phiên đã xác thực hoặc tác vụ đặc quyền), client không thể can thiệp.
 */
import { createCenDataClient, type CenTransport } from "@/lib/db/pg-rest-client";
import { runQueryPlan, runRpcPlan, type DbIdentity } from "@/lib/db/executor.server";

function transportFor(identity: DbIdentity): CenTransport {
  return {
    query: (plan) => runQueryPlan(plan, identity),
    rpc: (plan) => runRpcPlan(plan, identity),
  };
}

/** Truy vấn dưới danh tính người dùng đã đăng nhập — RLS vẫn áp dụng đầy đủ. */
export function createUserDataClient(userId: string) {
  return createCenDataClient(transportFor({ mode: "user", userId }));
}

/** Truy vấn đặc quyền của máy chủ (tạo tài khoản, gửi thông báo hệ thống). */
export function createPrivilegedDataClient() {
  return createCenDataClient(transportFor({ mode: "privileged" }));
}
