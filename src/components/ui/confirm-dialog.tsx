import * as React from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, IconButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Confirmation Dialog (M1.1D)
 * Chỉ phát callback `onConfirm` / `onCancel`. Không tự gọi API, không đổi dữ liệu.
 * `loading` chặn thao tác lặp lại; Button giữ nguyên kích thước khi loading (M1.1B).
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  tone?: "normal" | "destructive";
  loading?: boolean;
  /** Vô hiệu hoá nút xác nhận (ví dụ chưa đủ điều kiện do bên ngoài quyết định). */
  confirmDisabled?: boolean;
  icon?: LucideIcon | null;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  onConfirm,
  onCancel,
  tone = "normal",
  loading = false,
  confirmDisabled = false,
  icon,
}: ConfirmDialogProps) {
  const destructive = tone === "destructive";
  const Icon = icon === null ? null : (icon ?? (destructive ? AlertTriangle : HelpCircle));

  const handleOpenChange = (next: boolean) => {
    if (loading) return; // chặn đóng khi đang xử lý
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-0 p-0 [&>[data-slot=dialog-close]]:hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4">
          <div className="flex min-w-0 gap-3">
            {Icon ? (
              <span
                className={cn(
                  "mt-0.5 grid size-8 shrink-0 place-items-center rounded-control border",
                  destructive
                    ? "border-state-danger/50 bg-state-danger-surface text-state-danger"
                    : "border-border-default bg-surface-subtle text-text-muted",
                )}
                aria-hidden="true"
              >
                <Icon className="size-icon-md" />
              </span>
            ) : null}
            <div className="min-w-0">
              <DialogTitle className="text-h4">{title}</DialogTitle>
              {description ? (
                <DialogDescription className="mt-1">{description}</DialogDescription>
              ) : (
                <DialogDescription className="sr-only">Hộp thoại xác nhận</DialogDescription>
              )}
            </div>
          </div>
          <DialogClose asChild>
            <IconButton variant="ghost" size="icon-sm" label="Đóng" type="button" disabled={loading}>
              <X />
            </IconButton>
          </DialogClose>
        </div>
        {children ? (
          <div className="max-h-[50dvh] overflow-y-auto overscroll-contain px-4 pb-4 text-body text-text-secondary">
            {children}
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 border-t border-border-default p-4 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
