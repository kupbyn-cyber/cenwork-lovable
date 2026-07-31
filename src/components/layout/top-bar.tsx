import { Bell, Menu, Search } from "lucide-react";

import { IconButton } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * CEN 1.0 — Top Bar (M1.2)
 * Chỉ là shell: search chưa xử lý tìm kiếm thật, action chưa gắn nghiệp vụ.
 */
export function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border-default bg-background/95 px-3 backdrop-blur sm:px-4">
      <IconButton
        variant="ghost"
        size="icon"
        type="button"
        className="md:hidden"
        onClick={onOpenMobileNav}
        label="Mở menu điều hướng"
      >
        <Menu />
      </IconButton>

      <div className="min-w-0 flex-1">
        <label className="relative block max-w-md">
          <span className="sr-only">Tìm kiếm trong hệ thống</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-icon-md -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            readOnly
            placeholder="Tìm kiếm (chưa khả dụng)"
            className="h-control-md w-full rounded-control border border-border-default bg-surface pr-3 pl-9 text-label text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          />
        </label>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <IconButton
              variant="ghost"
              size="icon"
              type="button"
              disabled
              label="Thông báo — chưa khả dụng"
            >
              <Bell />
            </IconButton>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Thông báo — chưa khả dụng</TooltipContent>
      </Tooltip>
    </header>
  );
}
