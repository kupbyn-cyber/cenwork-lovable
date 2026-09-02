import * as React from "react";

import { Button } from "@/components/ui/button";
import { pushSupported, useWebPush } from "@/hooks/use-web-push";

/**
 * CEN-PUSH-P01 — nhắc bật thông báo thiết bị một cách nhẹ nhàng.
 * Không xin quyền khi tải trang, không lặp lại sau khi người dùng bỏ qua.
 */
const DISMISS_KEY = "cen.push.onboarding.dismissed";

export function PushOnboardingBanner() {
  const { status, ready, busy, enable } = useWebPush();
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const permissionDefault =
    typeof Notification !== "undefined" && Notification.permission === "default";

  if (dismissed || !ready || !pushSupported() || status !== "disabled" || !permissionDefault) {
    return null;
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage bị chặn: chỉ ẩn trong phiên này */
    }
  }

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border-default bg-surface-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body text-text-secondary">
        Bật thông báo để không bỏ lỡ nội dung cần xử lý trong CEN.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" loading={busy} onClick={() => void enable()}>
          Bật thông báo
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Để sau
        </Button>
      </div>
    </div>
  );
}
