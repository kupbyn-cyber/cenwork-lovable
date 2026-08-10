/**
 * CEN-MB-FIX-01 — Gắn bearer token cho serverFn chỉ khi backend là hạ tầng cũ.
 *
 * Ở chế độ PostgreSQL (`VITE_CEN_DB=postgres`), phiên nằm trong cookie HttpOnly
 * nên trình duyệt không cần — và không được — khởi tạo client Supabase.
 */
import { createMiddleware } from "@tanstack/react-start";

import { isPostgresMode } from "./client";

export const attachCenAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  if (isPostgresMode()) return next();

  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});