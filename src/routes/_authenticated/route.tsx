import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { LoadingBlock } from "@/components/ui/spinner";

/**
 * CEN 1.0 — Vùng ứng dụng yêu cầu đăng nhập (M1.3).
 * ssr:false vì session được Auth SDK lưu ở trình duyệt; kiểm tra trước khi render
 * để không chớp nội dung được bảo vệ.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  pendingComponent: () => (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <LoadingBlock label="Đang kiểm tra phiên đăng nhập" />
    </div>
  ),
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
