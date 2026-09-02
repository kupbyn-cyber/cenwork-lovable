import * as React from "react";

import {
  getPushConfig,
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/push.functions";

/**
 * CEN-PUSH-P01 — quản lý Web Push ở phía trình duyệt.
 * Không bao giờ tự xin quyền khi tải trang: chỉ xin sau khi người dùng bấm nút.
 */
export type PushStatus = "unsupported" | "unconfigured" | "blocked" | "enabled" | "disabled";

const SW_URL = "/sw-push.js";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Đăng xuất: gỡ liên kết thiết bị hiện tại theo kiểu best-effort.
 * Mọi lỗi đều nuốt — dọn dẹp push không được chặn đăng xuất.
 */
export async function unlinkCurrentPushSubscription(): Promise<void> {
  try {
    if (!pushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await deletePushSubscription({ data: { endpoint: subscription.endpoint } });
  } catch {
    /* best-effort */
  }
}

export function useWebPush() {
  const [status, setStatus] = React.useState<PushStatus>("disabled");
  const [ready, setReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const publicKeyRef = React.useRef<string | null>(null);

  const sync = React.useCallback(async () => {
    if (!pushSupported()) {
      setStatus("unsupported");
      setReady(true);
      return;
    }
    try {
      const config = await getPushConfig();
      publicKeyRef.current = config.publicKey;
      if (!config.publicKey) {
        setStatus("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration(SW_URL);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription && Notification.permission === "granted") {
        // Máy dùng chung: đồng bộ lại để endpoint gắn đúng người đang đăng nhập.
        const json = subscription.toJSON();
        await savePushSubscription({
          data: {
            endpoint: subscription.endpoint,
            p256dh: json.keys?.["p256dh"] ?? "",
            auth: json.keys?.["auth"] ?? "",
            userAgent: navigator.userAgent,
          },
        });
        setStatus("enabled");
        return;
      }
      setStatus("disabled");
    } catch {
      setStatus("disabled");
    } finally {
      setReady(true);
    }
  }, []);

  React.useEffect(() => {
    void sync();
  }, [sync]);

  const enable = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!pushSupported()) {
        setStatus("unsupported");
        return;
      }
      let publicKey = publicKeyRef.current;
      if (!publicKey) {
        const config = await getPushConfig();
        publicKey = config.publicKey;
        publicKeyRef.current = publicKey;
      }
      if (!publicKey) {
        setStatus("unconfigured");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStatus("blocked");
        return;
      }
      if (permission !== "granted") {
        setStatus("disabled");
        return;
      }

      const registration = await navigator.serviceWorker.register(SW_URL);
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

      const json = subscription.toJSON();
      await savePushSubscription({
        data: {
          endpoint: subscription.endpoint,
          p256dh: json.keys?.["p256dh"] ?? "",
          auth: json.keys?.["auth"] ?? "",
          userAgent: navigator.userAgent,
        },
      });
      setStatus("enabled");
    } catch (err) {
      setError((err as Error).message || "Không bật được thông báo trên thiết bị này.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const disable = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration(SW_URL);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        // Chỉ tắt thiết bị này: các thiết bị khác của cùng người dùng giữ nguyên.
        await deletePushSubscription({ data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setStatus("disabled");
    } catch (err) {
      setError((err as Error).message || "Không tắt được thông báo trên thiết bị này.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return { status, ready, busy, error, enable, disable };
}
