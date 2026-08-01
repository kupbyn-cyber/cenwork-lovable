import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonTableRows } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — DataTable (M1.1C)
 * BR-M1.1C-03: renders provided data only. No sort / filter / pagination / fetch.
 * Loading, empty and error visuals are injected through `stateSlot` (built in M1.1D).
 */
export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Inline min/max width, e.g. "min-w-[200px]". */
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> extends React.HTMLAttributes<HTMLDivElement> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Show the presentational selection column. Selection state is owned by the caller. */
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  onRowClick?: (row: T) => void;
  density?: "compact" | "default";
  /** Slot for shared Loading / Empty / Error state (M1.1D). Replaces body rows. */
  stateSlot?: React.ReactNode | undefined;
  /** M1.1D: dùng Skeleton row dùng chung. */
  loading?: boolean | undefined;
  skeletonRows?: number | undefined;
  /** M1.1D: có lỗi → Error State compact. Table không tự fetch lại. */
  error?: boolean | undefined;
  onRetry?: (() => void) | undefined;
  errorTitle?: string | undefined;
  errorDescription?: React.ReactNode | undefined;
  /** M1.1D: không có dữ liệu → Empty State compact. */
  emptyTitle?: string | undefined;
  emptyDescription?: React.ReactNode | undefined;
  emptyAction?: React.ReactNode | undefined;
  caption?: string;
  /** Extra classes on the <table> element, e.g. "table-fixed". */
  tableClassName?: string;
}

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

function DataTableInner<T>(
  {
    columns,
    data,
    getRowId,
    selectable = false,
    selectedIds,
    onSelectedIdsChange,
    onRowClick,
    density = "default",
    stateSlot,
    loading = false,
    skeletonRows = 5,
    error = false,
    onRetry,
    errorTitle,
    errorDescription,
    emptyTitle = "Chưa có dữ liệu",
    emptyDescription = "Nội dung sẽ hiển thị tại đây khi có dữ liệu.",
    emptyAction,
    caption,
    tableClassName,
    className,
    ...props
  }: DataTableProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const selected = React.useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const rowIds = data.map(getRowId);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const someSelected = rowIds.some((id) => selected.has(id));
  const cellPad = density === "compact" ? "py-1.5" : "py-2.5";
  const colCount = columns.length + (selectable ? 1 : 0);

  const resolvedState: React.ReactNode = stateSlot
    ? stateSlot
    : error
      ? (
          <ErrorState
            variant="compact"
            title={errorTitle}
            description={errorDescription}
            onRetry={onRetry}
          />
        )
      : loading
        ? <SkeletonTableRows rows={skeletonRows} columns={colCount} />
        : data.length === 0
          ? (
              <EmptyState
                variant="compact"
                title={emptyTitle}
                description={emptyDescription}
                action={emptyAction}
              />
            )
          : null;

  const toggleAll = () => {
    if (!onSelectedIdsChange) return;
    onSelectedIdsChange(allSelected ? [] : rowIds);
  };

  const toggleOne = (id: string) => {
    if (!onSelectedIdsChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange([...next]);
  };

  return (
    <TableContainer ref={ref} className={className} {...props}>
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectable ? (
              <TableHead className="w-10 pr-0">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Chọn tất cả dòng"
                  disabled={!onSelectedIdsChange || Boolean(resolvedState)}
                />
              </TableHead>
            ) : null}
            {columns.map((col) => (
              <TableHead
                key={col.id}
                className={cn(alignClass[col.align ?? "left"], col.headerClassName)}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {resolvedState ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colCount} className="p-0">
                {resolvedState}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => {
              const id = getRowId(row);
              const isSelected = selected.has(id);
              return (
                <TableRow
                  key={id}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {selectable ? (
                    <TableCell
                      className={cn("w-10 pr-0", cellPad)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(id)}
                        aria-label={`Chọn dòng ${id}`}
                        disabled={!onSelectedIdsChange}
                      />
                    </TableCell>
                  ) : null}
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(cellPad, alignClass[col.align ?? "left"], col.className)}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export const DataTable = React.forwardRef(DataTableInner) as <T>(
  props: DataTableProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => React.ReactElement;

/** Two-line cell: primary text + muted secondary text, with safe truncation. */
export function TableCellStack({
  primary,
  secondary,
  className,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="truncate text-body font-medium text-text-primary">{primary}</div>
      {secondary ? (
        <div className="truncate text-helper text-text-muted">{secondary}</div>
      ) : null}
    </div>
  );
}

/** Action cell wrapper: quieter by default, full contrast on hover-capable devices. */
export function TableRowActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-1 cen-transition",
        "hover:opacity-100 group-hover/row:opacity-100 focus-within:opacity-100",
        "[@media(hover:hover)]:opacity-70",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
