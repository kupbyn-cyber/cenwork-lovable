import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import type { ExternalToast } from "sonner";

/**
 * CEN 1.0 — Toast (M1.1D)
 * 4 trạng thái: success, error, warning, information. Tự đóng, có thể đóng thủ công.
 * Không dùng thay lỗi cấp field/form, không hiển thị lỗi kỹ thuật thô.
 */
type ToastOptions = Omit<ExternalToast, "icon" | "closeButton"> & {
  description?: string;
};

const base: ExternalToast = { closeButton: true, duration: 4500 };

export const cenToast = {
  success: (message: string, options?: ToastOptions) =>
    sonnerToast.success(message, {
      ...base,
      ...options,
      icon: <CheckCircle2 className="size-icon-md text-state-success" />,
    }),
  error: (message: string, options?: ToastOptions) =>
    sonnerToast.error(message, {
      ...base,
      duration: 6000,
      ...options,
      icon: <XCircle className="size-icon-md text-state-danger" />,
    }),
  warning: (message: string, options?: ToastOptions) =>
    sonnerToast.warning(message, {
      ...base,
      duration: 5500,
      ...options,
      icon: <AlertTriangle className="size-icon-md text-state-warning" />,
    }),
  info: (message: string, options?: ToastOptions) =>
    sonnerToast.info(message, {
      ...base,
      ...options,
      icon: <Info className="size-icon-md text-state-info" />,
    }),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};
