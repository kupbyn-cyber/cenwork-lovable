import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { dutyRulesQuery, type DutyRuleRow } from "@/lib/duty-data";

/**
 * CEN DUTY-02 — Nội quy & tiêu chuẩn vệ sinh (chỉ để xem, không có Đạt/Không đạt).
 */
function groupByCategory(rows: DutyRuleRow[]) {
  const map = new Map<string, DutyRuleRow[]>();
  for (const row of rows) {
    map.set(row.category, [...(map.get(row.category) ?? []), row]);
  }
  return Array.from(map.entries());
}

export function DutyRulesPanel() {
  const { data, isLoading, error } = useQuery(dutyRulesQuery());

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-caption text-state-danger">{(error as Error).message}</p>;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return <EmptyState icon={BookOpen} variant="compact" title="Chưa có nội quy được cấu hình" />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {groupByCategory(rows).map(([category, items]) => (
        <section key={category} className="min-w-0">
          <h3 className="mb-2 text-caption font-semibold tracking-[0.12em] text-text-muted uppercase">
            {category}
          </h3>
          <ul className="flex flex-col gap-2">
            {items.map((rule) => (
              <li
                key={rule.id}
                className="min-w-0 rounded-control border border-border-default bg-background-elevated p-3"
              >
                <p className="text-label font-medium break-words text-text-primary">{rule.title}</p>
                <p className="mt-1 text-caption break-words text-text-secondary">{rule.content}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
