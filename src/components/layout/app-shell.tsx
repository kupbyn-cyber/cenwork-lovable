import * as React from "react";
import { X } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { IconButton } from "@/components/ui/button";
import { AppSidebar, CenLogo, SidebarNav } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { OverdueAnnouncementBanner } from "@/components/announcement/overdue-banner";

/**
 * CEN 1.0 — App Shell (M1.2)
 * Desktop: Sidebar cố định + Top Bar sticky + Main Content cuộn riêng.
 * Mobile (<768px): Sidebar chuyển thành Drawer.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <AppSidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
            <div className="mb-4 empty:mb-0">
              <OverdueAnnouncementBanner />
            </div>
            {children}
          </div>
        </main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex w-[17rem] max-w-[85vw] flex-col gap-0 overflow-hidden border-r border-border-default bg-background-elevated p-0 [&>[data-slot=dialog-close]]:hidden"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border-default px-3 py-3">
            <SheetTitle className="min-w-0">
              <CenLogo />
            </SheetTitle>
            <SheetDescription className="sr-only">Menu điều hướng chính</SheetDescription>
            <IconButton
              variant="ghost"
              size="icon-sm"
              type="button"
              label="Đóng menu"
              onClick={() => setMobileOpen(false)}
            >
              <X />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
