import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Menu, Search, ShieldOff, User } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntityAvatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cenToast } from "@/components/ui/toast";
import { getDisplayName, useAuth } from "@/hooks/use-auth";
import { logSelfAuditEvent } from "@/lib/audit-data";
import { supabase } from "@/integrations/supabase/client";

/**
 * CEN 1.0 — Top Bar (M1.2 + M1.3)
 * Search vẫn là shell; phần tài khoản dùng session thật.
 */
export function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const displayName = getDisplayName(user);

  const [confirmGlobal, setConfirmGlobal] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut(scope: "local" | "global") {
    if (signingOut) return;
    setSigningOut(true);
    if (scope === "global" && user?.id) {
      // Ghi audit trước khi phiên bị thu hồi (không lưu token hay mật khẩu).
      await logSelfAuditEvent(user.id, "account.signed_out_all").catch(() => undefined);
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut({ scope });
    setSigningOut(false);
    if (error) {
      cenToast.error("Không đăng xuất được. Vui lòng thử lại.");
      return;
    }
    setConfirmGlobal(false);
    await navigate({ to: "/login", replace: true });
  }

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="max-w-[12rem] gap-2 px-1.5"
            aria-label="Menu tài khoản"
          >
            <EntityAvatar name={displayName || user?.email || "Tài khoản"} size="sm" />
            <span className="hidden min-w-0 truncate sm:block">{displayName}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="min-w-0">
            <span className="block truncate text-label font-semibold text-text-primary">
              {displayName || "Tài khoản"}
            </span>
            <span className="block truncate text-caption font-normal text-text-muted">
              {user?.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void navigate({ to: "/settings" })}>
            <User />
            Hồ sơ cá nhân
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={signingOut} onSelect={() => void signOut("local")}>
            <LogOut />
            Đăng xuất
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={signingOut}
            onSelect={(event) => {
              event.preventDefault();
              setConfirmGlobal(true);
            }}
          >
            <ShieldOff />
            Đăng xuất toàn bộ thiết bị
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmGlobal}
        onOpenChange={setConfirmGlobal}
        tone="destructive"
        title="Đăng xuất toàn bộ thiết bị?"
        description="Tất cả phiên đăng nhập hiện tại của tài khoản này sẽ bị kết thúc."
        confirmLabel="Đăng xuất tất cả"
        loading={signingOut}
        onConfirm={() => void signOut("global")}
      />
    </header>
  );
}
