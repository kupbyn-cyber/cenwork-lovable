import * as React from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAnnouncementLock } from "@/hooks/use-announcement-lock";

/**
 * CEN 1.0 — M6.1 banner giới hạn thao tác do thông báo nội bộ quá hạn.
 */
export function OverdueAnnouncementBanner() {
  const { locked, overdueCount } = useAnnouncementLock();
  if (!locked) return null;

  return (
    <div
      role="alert"
      className="flex min-w-0 flex-col gap-3 rounded-control border border-state-danger/50 bg-state-danger/10 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-danger" aria-hidden="true" />
        <p className="min-w-0 break-words text-body-sm text-text-primary">
          Bạn đang bị giới hạn thao tác vì còn <strong>{overdueCount}</strong> thông báo nội bộ quá
          hạn chưa xác nhận. Hãy xác nhận để mở khóa ngay.
        </p>
      </div>
      <Button asChild size="sm" variant="secondary" className="shrink-0">
        <Link to="/announcements">Xem thông báo quá hạn</Link>
      </Button>
    </div>
  );
}
