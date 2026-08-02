import * as React from "react";
import { X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CEN — FormModal (UI-FORM-01)
 * Modal căn giữa dùng chung cho các luồng "tạo mới" (thay drawer phải).
 * - Desktop/tablet: căn giữa viewport, nội dung cuộn bên trong.
 * - Mobile: full-screen.
 * - Có cảnh báo rời form khi `dirty` = true.
 * Không chứa logic nghiệp vụ.
 */
const sizeClass = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-[880px]",
} as const;

export interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof sizeClass;
  hideCloseButton?: boolean;
  /** Đang có dữ liệu chưa lưu -> hỏi xác nhận trước khi đóng. */
  dirty?: boolean;
  /** Chặn mọi thao tác đóng (ví dụ đang submit). */
  busy?: boolean;
}

export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "lg",
  hideCloseButton = false,
  dirty = false,
  busy = false,
}: FormModalProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const requestClose = React.useCallback(
    (next: boolean) => {
      if (next) {
        onOpenChange(true);
        return;
      }
      if (busy) return;
      if (dirty) {
        setConfirmOpen(true);
        return;
      }
      onOpenChange(false);
    },
    [busy, dirty, onOpenChange],
  );

  // Focus trường nhập đầu tiên khi mở (thay vì nút đóng).
  const focusFirstField = React.useCallback((event: Event) => {
    const root = bodyRef.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable=true]",
    );
    if (first) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          onOpenAutoFocus={focusFirstField}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0 sm:p-0 [&>[data-slot=dialog-close]]:hidden",
            // Mobile: full-screen
            "left-0 top-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0",
            // Desktop/tablet: căn giữa
            "sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-container sm:border",
            sizeClass[size],
          )}
        >
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border-default p-4">
            <div className="min-w-0">
              <DialogTitle className="text-h4">{title}</DialogTitle>
              {description ? (
                <DialogDescription className="mt-1">{description}</DialogDescription>
              ) : (
                <DialogDescription className="sr-only">Biểu mẫu</DialogDescription>
              )}
            </div>
            {!hideCloseButton ? (
              <IconButton
                variant="ghost"
                size="icon-sm"
                label="Đóng"
                type="button"
                disabled={busy}
                onClick={() => requestClose(false)}
              >
                <X />
              </IconButton>
            ) : null}
          </div>
          <div
            ref={bodyRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 text-body text-text-secondary"
          >
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border-default p-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Rời biểu mẫu?"
        description="Bạn đang nhập dở. Nội dung chưa lưu sẽ không được giữ lại."
        confirmLabel="Rời và bỏ nội dung"
        cancelLabel="Tiếp tục nhập"
        tone="destructive"
        onConfirm={() => {
          setConfirmOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
