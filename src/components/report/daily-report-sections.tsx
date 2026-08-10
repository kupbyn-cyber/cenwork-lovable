import * as React from "react";

import { cn } from "@/lib/utils";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { formatHanoiTime } from "@/lib/datetime";
import {
  groupItemsByProject,
  type DailyReportCounts,
  type DailyReportItem,
} from "@/lib/daily-report-content";

/**
 * CEN-VIEW-REPORT-UX-COMPACT-01 — khung hiển thị dùng chung của Báo cáo ngày.
 * Cùng một cấu trúc 3 phần cho form tạo và màn hình chi tiết.
 */

function ExpandableText({
  text,
  clamp,
  className,
}: {
  text: string;
  clamp: 2 | 4;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = React.useState(false);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setOverflowing(node.scrollHeight - node.clientHeight > 2);
  }, [text]);

  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <div
        ref={ref}
        className={cn(
          "min-w-0 break-words",
          !expanded && (clamp === 2 ? "line-clamp-2" : "line-clamp-4"),
          className,
        )}
      >
        <LinkifiedText as="span" text={text} />
      </div>
      {overflowing ? (
        <button
          type="button"
          className="cen-transition text-helper text-brand-primary hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Thu gọn" : "Xem thêm"}
        </button>
      ) : null}
    </div>
  );
}

function ItemCard({ item, showProject }: { item: DailyReportItem; showProject: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border-default bg-surface-default p-3">
      <ExpandableText
        text={item.name}
        clamp={2}
        className="text-body font-medium text-text-primary"
      />
      <div className="flex flex-wrap items-center gap-x-2 text-helper text-text-muted">
        {showProject ? <span>{item.projectName ?? "Công việc độc lập"}</span> : null}
        {item.completedAt ? <span>Hoàn thành {formatHanoiTime(item.completedAt)}</span> : null}
      </div>
      {item.result ? (
        <ExpandableText text={item.result} clamp={4} className="text-body-sm text-text-secondary" />
      ) : (
        <span className="text-helper text-text-muted">Chưa cập nhật kết quả.</span>
      )}
    </div>
  );
}

export interface DailyReportSectionsProps {
  items: DailyReportItem[];
  /** Text kết quả cũ không tách được thành từng Task. */
  rawResults?: string;
  counts: DailyReportCounts | null;
  rawSummary?: string;
  note?: string;
  /** Form tạo truyền ô nhập ghi chú vào đây. */
  noteSlot?: React.ReactNode;
  loading?: boolean;
  /** Ghi chú phụ dưới tiêu đề phần 1 (form tạo). */
  completedHint?: string;
  /** Nội dung bổ sung cuối phần 1 (cảnh báo thiếu kết quả). */
  completedFooter?: React.ReactNode;
}

export function DailyReportSections({
  items,
  rawResults = "",
  counts,
  rawSummary = "",
  note = "",
  noteSlot,
  loading = false,
  completedHint,
  completedFooter,
}: DailyReportSectionsProps) {
  const groups = React.useMemo(() => groupItemsByProject(items), [items]);
  const multiProject = groups.length > 1;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="rounded-card border border-border-default bg-surface-subtle p-3">
        <p className="text-label font-semibold text-text-primary">1. Task đã hoàn thành hôm nay</p>
        {completedHint ? <p className="mt-1 text-helper text-text-muted">{completedHint}</p> : null}
        <div className="mt-3 flex min-w-0 flex-col gap-3">
          {loading ? (
            <p className="text-helper text-text-muted">Đang tổng hợp…</p>
          ) : items.length === 0 ? (
            rawResults ? (
              <div className="rounded-card border border-border-default bg-surface-default p-3">
                <p className="text-helper text-text-muted">Kết quả đã nhập</p>
                <LinkifiedText
                  as="p"
                  className="mt-1 break-words text-body-sm text-text-secondary"
                  text={rawResults}
                />
              </div>
            ) : (
              <p className="text-helper text-text-muted">Không có Task hoàn thành trong ngày này.</p>
            )
          ) : multiProject ? (
            groups.map((group) => (
              <div key={group.project} className="flex min-w-0 flex-col gap-2">
                <p className="text-helper font-medium text-text-secondary">{group.project}</p>
                {group.items.map((item, index) => (
                  <ItemCard key={`${group.project}-${index}`} item={item} showProject={false} />
                ))}
              </div>
            ))
          ) : (
            items.map((item, index) => (
              <ItemCard key={`${item.name}-${index}`} item={item} showProject />
            ))
          )}
        </div>
        {completedFooter}
      </section>

      <section className="rounded-card border border-border-default bg-surface-subtle p-3">
        <p className="text-label font-semibold text-text-primary">2. Tổng quan công việc còn lại</p>
        {counts ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: "Task còn mở", value: counts.open },
              { label: "Task quá hạn", value: counts.overdue },
              { label: "Task chờ kiểm tra", value: counts.review },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-card border border-border-default bg-surface-default p-2 text-center"
              >
                <p className="text-h3 font-semibold text-text-primary">{item.value}</p>
                <p className="text-helper text-text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        ) : rawSummary ? (
          <LinkifiedText
            as="p"
            className="mt-2 break-words text-body-sm text-text-secondary"
            text={rawSummary}
          />
        ) : (
          <p className="mt-2 text-helper text-text-muted">Chưa có số liệu tổng quan.</p>
        )}
      </section>

      <section className="rounded-card border border-border-default bg-surface-subtle p-3">
        <p className="text-label font-semibold text-text-primary">3. Ghi chú / Ý kiến cá nhân</p>
        {noteSlot ? (
          <div className="mt-2">{noteSlot}</div>
        ) : note ? (
          <LinkifiedText
            as="p"
            className="mt-2 break-words text-body-sm text-text-secondary"
            text={note}
          />
        ) : (
          <p className="mt-2 text-helper text-text-muted">Không có ghi chú.</p>
        )}
      </section>
    </div>
  );
}
