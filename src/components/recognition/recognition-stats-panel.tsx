import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrgAccess } from "@/hooks/use-org-access";
import { teamsQuery } from "@/lib/org-data";
import {
  RECOGNITION_CATEGORY_LABEL,
  RECOGNITION_CATEGORY_ORDER,
  type RecognitionCategory,
} from "@/lib/recognition-data";
import {
  RECOGNITION_RANGE_LABEL,
  rangeDates,
  recognitionStatsQuery,
  type RecognitionRange,
  type RecognitionStatRow,
} from "@/lib/recognition-stats";

/**
 * CEN TODAY-03 — thống kê ghi nhận theo tuần/tháng/quý và theo Team.
 * Chỉ hiển thị số lượng; nội dung và người gửi không bao giờ được trả về.
 * Phạm vi dữ liệu do hàm database quyết định, UI không tự nới quyền.
 */
export function RecognitionStatsPanel({
  title = "Thống kê ghi nhận",
  fixedTeamId = null,
  fixedRange,
  description,
}: {
  title?: string;
  /** Khóa cứng theo Team (dùng trong Báo cáo tuần của Team). */
  fixedTeamId?: string | null;
  /** Khóa cứng khoảng thời gian (ẩn bộ lọc thời gian). */
  fixedRange?: { from: string; to: string };
  description?: string;
}) {
  const access = useOrgAccess();
  const isMobile = useIsMobile();
  const [range, setRange] = React.useState<RecognitionRange>("week");
  const [teamId, setTeamId] = React.useState<string>(fixedTeamId ?? "all");
  const [category, setCategory] = React.useState<string>("all");

  const teamsResult = useQuery({ ...teamsQuery(), enabled: access.isSystemAdmin && !fixedTeamId });

  const dates = fixedRange ?? rangeDates(range);
  const effectiveTeam = fixedTeamId ?? (teamId === "all" ? null : teamId);

  const statsResult = useQuery(
    recognitionStatsQuery({
      from: dates.from,
      to: dates.to,
      teamId: effectiveTeam,
      category: category === "all" ? null : (category as RecognitionCategory),
    }),
  );

  const rows = statsResult.data ?? [];
  const total = rows.reduce((sum, row) => sum + row.total_count, 0);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-icon-sm shrink-0 text-state-success" aria-hidden="true" />
          {title} ({total})
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {fixedRange ? null : (
            <Tabs value={range} onValueChange={(value) => setRange(value as RecognitionRange)}>
              <TabsList>
                {(["week", "month", "quarter"] as RecognitionRange[]).map((key) => (
                  <TabsTrigger key={key} value={key}>
                    {RECOGNITION_RANGE_LABEL[key]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {access.isSystemAdmin && !fixedTeamId ? (
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="w-[168px]" aria-label="Lọc theo Team">
                <SelectValue placeholder="Tất cả Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả Team</SelectItem>
                {(teamsResult.data ?? []).map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[168px]" aria-label="Lọc theo nhóm ghi nhận">
              <SelectValue placeholder="Tất cả nhóm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhóm</SelectItem>
              {RECOGNITION_CATEGORY_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {RECOGNITION_CATEGORY_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {description ? (
          <p className="mb-2 text-helper text-text-muted">{description}</p>
        ) : null}

        {statsResult.isLoading ? (
          <SkeletonCard lines={3} />
        ) : statsResult.isError ? (
          <ErrorState
            variant="compact"
            title="Không tải được thống kê ghi nhận"
            onRetry={() => void statsResult.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            variant="compact"
            title="Chưa có lời ghi nhận nào"
            description="Khoảng thời gian và bộ lọc hiện tại chưa ghi nhận dữ liệu."
          />
        ) : isMobile ? (
          <div className="flex min-w-0 flex-col gap-2">
            {rows.map((row) => (
              <StatCard key={row.receiver_id} row={row} />
            ))}
          </div>
        ) : (
          <StatTable rows={rows} />
        )}
      </CardContent>
    </Card>
  );
}

const COLUMNS: { key: keyof RecognitionStatRow; category: RecognitionCategory }[] =
  RECOGNITION_CATEGORY_ORDER.map((category) => ({
    key: `${category}_count` as keyof RecognitionStatRow,
    category,
  }));

function StatTable({ rows }: { rows: RecognitionStatRow[] }) {
  return (
    <div className="min-w-0">
      <table className="w-full table-fixed border-collapse text-body">
        <thead>
          <tr className="border-b border-border-default text-left">
            <th className="py-2 pr-2 text-label font-semibold text-text-secondary">Người nhận</th>
            <th className="w-[132px] py-2 pr-2 text-label font-semibold text-text-secondary">
              Team
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column.category}
                className="w-[92px] py-2 pr-2 text-label font-semibold text-text-secondary"
                title={RECOGNITION_CATEGORY_LABEL[column.category]}
              >
                {RECOGNITION_CATEGORY_LABEL[column.category]}
              </th>
            ))}
            <th className="w-[72px] py-2 text-right text-label font-semibold text-text-secondary">
              Tổng
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.receiver_id} className="border-b border-border-subtle last:border-0">
              <td className="truncate py-2 pr-2 text-text-primary">{row.display_name}</td>
              <td className="truncate py-2 pr-2 text-text-muted">{row.team_name ?? "—"}</td>
              {COLUMNS.map((column) => (
                <td key={column.category} className="py-2 pr-2 tabular-nums text-text-secondary">
                  {Number(row[column.key] ?? 0)}
                </td>
              ))}
              <td className="py-2 text-right font-semibold tabular-nums text-text-primary">
                {row.total_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ row }: { row: RecognitionStatRow }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border-default bg-surface p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-body font-medium text-text-primary">
          {row.display_name}
        </span>
        <span className="text-body font-semibold tabular-nums text-text-primary">
          {row.total_count}
        </span>
      </div>
      <span className="text-helper text-text-muted">{row.team_name ?? "Chưa gắn Team"}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-helper text-text-secondary">
        {COLUMNS.filter((column) => Number(row[column.key] ?? 0) > 0).map((column) => (
          <span key={column.category}>
            {RECOGNITION_CATEGORY_LABEL[column.category]}: {Number(row[column.key] ?? 0)}
          </span>
        ))}
      </div>
    </div>
  );
}
