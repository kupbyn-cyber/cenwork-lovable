import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cenToast } from "@/components/ui/toast";
import { useWebPush } from "@/hooks/use-web-push";

/**
 * CEN WORK — NOTIFY-PUSH-01: bật/tắt thông báo hệ điều hành cho thiết bị hiện tại.
 * Không thay đổi Notification Center hay Telegram — đây chỉ là kênh gửi thêm.
 */
const STATUS_TEXT: Record<string, string> = {
  enabled: "Đã bật",
  disabled: "Chưa bật",
  blocked: "Đã bị trình duyệt chặn",
  unsupported: "Trình duyệt không hỗ trợ",
  unconfigured: "Chưa được cấu hình trên máy chủ",
};

export function DevicePushSection() {
  const { status, ready, busy, error, enable, disable } = useWebPush();

  async function handleEnable() {
    await enable();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      cenToast.success("Đã bật thông báo trên thiết bị này.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Thông báo trên thiết bị</CardTitle>
          <CardDescription>
            Nhận thông báo CEN ngay trên Windows/macOS qua trình duyệt, kể cả khi CEN không phải tab
            đang mở.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-body text-text-secondary">
          Trạng thái:{" "}
          <span className="font-semibold text-text-primary">
            {ready ? (STATUS_TEXT[status] ?? "Chưa bật") : "Đang kiểm tra…"}
          </span>
        </p>

        {status === "blocked" ? (
          <p className="text-helper text-text-secondary">
            Trình duyệt đang chặn thông báo cho trang này. Mở cài đặt trang trong trình duyệt và cho
            phép Thông báo, sau đó tải lại trang.
          </p>
        ) : null}
        {status === "unconfigured" ? (
          <p className="text-helper text-text-secondary">
            Máy chủ chưa cấu hình khóa VAPID cho Web Push.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-helper text-state-danger">
            {error}
          </p>
        ) : null}

        <div>
          {status === "enabled" ? (
            <Button variant="secondary" loading={busy} onClick={() => void disable()}>
              Tắt thông báo trên thiết bị này
            </Button>
          ) : (
            <Button
              loading={busy}
              disabled={!ready || status === "unsupported" || status === "unconfigured"}
              onClick={() => void handleEnable()}
            >
              Bật thông báo trên thiết bị này
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
