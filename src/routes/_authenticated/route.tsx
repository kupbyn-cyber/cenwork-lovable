import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/integrations/cen/client";
import { LoadingBlock } from "@/components/ui/spinner";

/**
 * CEN WORK — Vùng ứng dụng yêu cầu đăng nhập (M1.3).
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
    // Chặn mọi route ứng dụng khi tài khoản còn dùng mật khẩu tạm thời.
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile?.must_change_password) {
      throw redirect({ to: "/change-password" });
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
