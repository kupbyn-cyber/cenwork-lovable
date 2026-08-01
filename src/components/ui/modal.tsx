import * as React from "react";
import { X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Modal (M1.1D)
 * Controlled open/close, title + description, content cuộn bên trong, footer tuỳ chọn.
 * Giữ nguyên keyboard/focus behavior của Radix Dialog. Không chứa logic nghiệp vụ.
 */
const sizeClass = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-[880px]",
} as const;

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof sizeClass;
  /** Ẩn nút đóng góc phải (ví dụ khi đang xử lý). */
  hideCloseButton?: boolean;
  contentClassName?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  hideCloseButton = false,
  contentClassName,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90dvh] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 [&>[data-slot=dialog-close]]:hidden",
          sizeClass[size],
        )}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border-default p-4">
          <div className="min-w-0">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription className="mt-1">{description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">Hộp thoại</DialogDescription>
            )}
          </div>
          {!hideCloseButton ? (
            <DialogClose asChild>
              <IconButton variant="ghost" size="icon-sm" label="Đóng" type="button">
                <X />
              </IconButton>
            </DialogClose>
          ) : null}
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 text-body text-text-secondary",
            contentClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-border-default p-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
