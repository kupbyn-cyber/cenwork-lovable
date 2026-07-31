import * as React from "react";
import { X } from "lucide-react";

import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Drawer (M1.1D)
 * Panel tạm thời có overlay: header, content cuộn nội bộ, footer.
 * KHÔNG phải Sidebar điều hướng (Sidebar thuộc App Shell, ngoài phạm vi M1.1D).
 */
export interface DrawerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  side?: "right" | "left" | "bottom";
  hideCloseButton?: boolean;
}

const sideClass = {
  right: "inset-y-0 right-0 h-dvh w-full max-w-full border-l sm:max-w-md",
  left: "inset-y-0 left-0 h-dvh w-full max-w-full border-r sm:max-w-md",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] w-full border-t",
} as const;

export function DrawerPanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  hideCloseButton = false,
}: DrawerPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn("flex flex-col gap-0 overflow-hidden p-0", sideClass[side])}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border-default p-4">
          <div className="min-w-0">
            <SheetTitle className="text-h4">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="mt-1">{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">Ngăn nội dung</SheetDescription>
            )}
          </div>
          {!hideCloseButton ? (
            <SheetClose asChild>
              <IconButton variant="ghost" size="icon-sm" label="Đóng" type="button">
                <X />
              </IconButton>
            </SheetClose>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 text-body text-text-secondary">
          {children}
        </div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-border-default p-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
