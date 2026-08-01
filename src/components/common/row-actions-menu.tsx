import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * CEN 1.0 — Menu ba chấm gom hành động phụ của Task và Dự án.
 * Chỉ nhận danh sách hành động đã được lọc theo quyền ở phía gọi;
 * server và RLS vẫn kiểm tra lại khi thực thi.
 */
export interface RowAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  tone?: "default" | "destructive";
  onSelect: () => void;
}

export function RowActionsMenu({
  actions,
  label = "Hành động khác",
}: {
  actions: RowAction[];
  label?: string;
}) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.key}
              variant={action.tone === "destructive" ? "destructive" : "default"}
              onSelect={(event) => {
                event.preventDefault();
                action.onSelect();
              }}
            >
              {Icon ? <Icon className="size-icon-sm" aria-hidden="true" /> : null}
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
