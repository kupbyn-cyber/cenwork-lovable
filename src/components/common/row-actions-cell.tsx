import * as React from "react";
import { Check, Eye, Pencil } from "lucide-react";

import { IconButton } from "@/components/ui/button";
import { TableRowActions } from "@/components/ui/data-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RowActionsMenu, type RowAction } from "@/components/common/row-actions-menu";

/**
 * CEN 1.0 — Ô "Hành động" dùng chung cho bảng Dự án và Công việc.
 * Hiển thị trực tiếp ba icon Xem / Sửa / Hoàn thành; các hành động phụ gom vào
 * menu ba chấm. Component chỉ trình bày: điều kiện hiển thị và quyền do phía gọi
 * quyết định, server và RLS vẫn kiểm tra lại khi thực thi.
 */
export interface RowActionsCellProps {
  onView: () => void;
  viewLabel?: string;
  onEdit?: (() => void) | null;
  editLabel?: string;
  onComplete?: (() => void) | null;
  completeLabel?: string;
  completing?: boolean;
  menuActions?: RowAction[];
}

function ActionIcon({
  label,
  icon: Icon,
  onSelect,
  disabled,
  loading,
  tone,
}: {
  label: string;
  icon: typeof Eye;
  onSelect: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "default" | "success";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          variant="ghost"
          size="icon-sm"
          label={label}
          title={undefined as unknown as string}
          disabled={disabled || loading}
          loading={loading}
          className={tone === "success" ? "text-state-success" : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <Icon />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function RowActionsCell({
  onView,
  viewLabel = "Xem chi tiết",
  onEdit,
  editLabel = "Chỉnh sửa",
  onComplete,
  completeLabel = "Hoàn thành",
  completing = false,
  menuActions = [],
}: RowActionsCellProps) {
  return (
    <TableRowActions>
      <ActionIcon label={viewLabel} icon={Eye} onSelect={onView} />
      {onEdit ? <ActionIcon label={editLabel} icon={Pencil} onSelect={onEdit} /> : null}
      {onComplete ? (
        <ActionIcon
          label={completeLabel}
          icon={Check}
          tone="success"
          loading={completing}
          onSelect={onComplete}
        />
      ) : null}
      <RowActionsMenu actions={menuActions} />
    </TableRowActions>
  );
}
