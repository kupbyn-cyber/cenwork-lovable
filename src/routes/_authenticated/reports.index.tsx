import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DailyReportDrawer } from "@/components/report/daily-report-drawer";
import { WeeklyReportDrawer } from "@/components/report/weekly-report-drawer";
import { ReportConfigPanel } from "@/components/report/report-config-panel";
import { ReportObligationsPanel } from "@/components/report/report-obligations-panel";
import { ReportDocList } from "@/components/report/report-doc-list";
import { ReportReviewDrawer } from "@/components/report/report-review-drawer";
import { TeamSummaryPanel } from "@/components/report/team-summary-panel";
import { ReportStatsPanel } from "@/components/report/report-stats-panel";
import { ReportArchivePanel } from "@/components/report/report-archive-panel";

import { useOrgAccess } from "@/hooks/use-org-access";
import { useReviewerDirectory } from "@/hooks/use-reviewer-directory";
import { membersQuery, teamsQuery } from "@/lib/org-data";
import { PERMISSIONS } from "@/lib/permissions";
import { formatHanoiDate } from "@/lib/datetime";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_ORDER,
  canCreateWeekly,
  canReviewDaily,
  canReviewWeekly,
  dailyReportsQuery,
  formatWeekLabel,
  hanoiToday,
  isReviewOverdue,
  mustSubmitDaily,
  reportStatusView,
  weeklyReportsQuery,
  type DailyReportRow,
  type WeeklyReportRow,
} from "@/lib/report-data";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "Báo cáo — CEN WORK" },
      {
        name: "description",
        content:
          "Báo cáo ngày cá nhân và báo cáo tuần của Team trong CEN WORK: gửi, duyệt và theo dõi trạng thái.",
      },
      { property: "og:title", content: "Báo cáo — CEN WORK" },
      {
        property: "og:description",
        content:
          "Báo cáo ngày cá nhân và báo cáo tuần của Team trong CEN WORK: gửi, duyệt và theo dõi trạng thái.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const ALL = "__all__";

function ReportsPage() {
  const access = useOrgAccess();
  const navigate = useNavigate();
  const directory = useReviewerDirectory();

  const dailyResult = useQuery(dailyReportsQuery());
  const weeklyResult = useQuery(weeklyReportsQuery());
  const teamsResult = useQuery(teamsQuery());
  const membersResult = useQuery(membersQuery());

  const [statusFilter, setStatusFilter] = React.useState(ALL);
  const [teamFilter, setTeamFilter] = React.useState(ALL);
  const [authorFilter, setAuthorFilter] = React.useState(ALL);
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [dailyOpen, setDailyOpen] = React.useState(false);
  const [weeklyOpen, setWeeklyOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<{ kind: "daily" | "weekly"; id: string } | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  function openDetail(kind: "daily" | "weekly", id: string) {
    setDetail({ kind, id });
    setDetailOpen(true);
  }

  const teams = teamsResult.data ?? [];
  const members = membersResult.data ?? [];
  const me = members.find((member) => member.id === access.userId) ?? null;

  const canViewObligations = access.can(PERMISSIONS.REPORTS_OBLIGATIONS_VIEW);
  const canConfigReports = access.can(PERMISSIONS.REPORTS_CONFIG) || access.isLeader;

  const ctx = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
  };

  const dailyRows = React.useMemo(() => {
    return (dailyResult.data ?? []).filter((row) => {
      if (statusFilter !== ALL && row.status !== statusFilter) return false;
      if (teamFilter !== ALL && row.team_id !== teamFilter) return false;
      if (authorFilter !== ALL && row.author_id !== authorFilter) return false;
      if (fromDate && row.report_date < fromDate) return false;
      if (toDate && row.report_date > toDate) return false;
      return true;
    });
  }, [dailyResult.data, statusFilter, teamFilter, authorFilter, fromDate, toDate]);

  const weeklyRows = React.useMemo(() => {
    return (weeklyResult.data ?? []).filter((row) => {
      if (statusFilter !== ALL && row.status !== statusFilter) return false;
      if (teamFilter !== ALL && row.team_id !== teamFilter) return false;
      if (authorFilter !== ALL && row.leader_id !== authorFilter) return false;
      if (fromDate && row.week_start < fromDate) return false;
      if (toDate && row.week_start > toDate) return false;
      return true;
    });
  }, [weeklyResult.data, statusFilter, teamFilter, authorFilter, fromDate, toDate]);

  const todayReport = (dailyResult.data ?? []).find(
    (row) => row.author_id === access.userId && row.report_date === hanoiToday(),
  );

  const awaitsMeDaily = React.useCallback(
    (row: DailyReportRow) => canReviewDaily(row, ctx, directory),
    [directory, ctx.userId, ctx.role, ctx.leaderTeamId],
  );
  const awaitsMeWeekly = React.useCallback(
    (row: WeeklyReportRow) => canReviewWeekly(row, ctx, directory),
    [directory, ctx.userId, ctx.role, ctx.leaderTeamId],
  );

  // Chỉ báo cáo thật sự đến lượt người dùng hiện tại mới vào "Chờ tôi duyệt".
  const myDailyQueue = dailyRows.filter(awaitsMeDaily);
  const myWeeklyQueue = weeklyRows.filter(awaitsMeWeekly);
  const myQueueCount = myDailyQueue.length + myWeeklyQueue.length;

  const dailyColumns = [
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[150px]",
      cell: (row: DailyReportRow) => {
        const view = reportStatusView(row.status, awaitsMeDaily(row));
        return (
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge label={view.label} tone={view.tone} />
            {awaitsMeDaily(row) ? <StatusBadge label="Chờ bạn duyệt" tone="warning" /> : null}
            {isReviewOverdue(row) ? <StatusBadge label="Quá hạn" tone="error" /> : null}
          </div>
        );
      },
    },
    {
      id: "author",
      header: "Người gửi",
      className: "min-w-[150px]",
      cell: (row: DailyReportRow) => (
        <span className="text-text-secondary">{row.authorName ?? "—"}</span>
      ),
    },
    {
      id: "date",
      header: "Ngày / Team",
      className: "min-w-[130px]",
      cell: (row: DailyReportRow) => (
        <TableCellStack primary={formatHanoiDate(row.report_date)} secondary={row.teamName ?? "—"} />
      ),
    },
    {
      id: "results",
      header: "Kết quả",
      className: "min-w-[220px]",
      cell: (row: DailyReportRow) => (
        <span className="line-clamp-2 text-text-secondary">{row.results ?? "—"}</span>
      ),
    },
    {
      id: "reviewer",
      header: "Người duyệt",
      className: "min-w-[150px]",
      cell: (row: DailyReportRow) => (
        <span className="text-text-secondary">{row.reviewerName ?? "—"}</span>
      ),
    },
  ];

  const weeklyColumns = [
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[150px]",
      cell: (row: WeeklyReportRow) => {
        const view = reportStatusView(row.status, awaitsMeWeekly(row));
        return (
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge label={view.label} tone={view.tone} />
            {awaitsMeWeekly(row) ? <StatusBadge label="Chờ bạn duyệt" tone="warning" /> : null}
            {isReviewOverdue(row) ? <StatusBadge label="Quá hạn" tone="error" /> : null}
          </div>
        );
      },
    },
    {
      id: "leader",
      header: "Leader gửi",
      className: "min-w-[150px]",
      cell: (row: WeeklyReportRow) => (
        <span className="text-text-secondary">{row.leaderName ?? "—"}</span>
      ),
    },
    {
      id: "week",
      header: "Tuần / Team",
      className: "min-w-[200px]",
      cell: (row: WeeklyReportRow) => (
        <TableCellStack
          primary={formatWeekLabel(row.week_start)}
          secondary={row.teamName ?? "—"}
        />
      ),
    },
    {
      id: "highlights",
      header: "Kết quả nổi bật",
      className: "min-w-[220px]",
      cell: (row: WeeklyReportRow) => (
        <span className="line-clamp-2 text-text-secondary">{row.highlights ?? "—"}</span>
      ),
    },
    {
      id: "reviewer",
      header: "Người duyệt",
      className: "min-w-[150px]",
      cell: (row: WeeklyReportRow) => (
        <span className="text-text-secondary">{row.reviewerName ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Báo cáo"
        description="Báo cáo ngày cá nhân và báo cáo tuần của Team, trong phạm vi bạn được xem."
        actions={
          <div className="flex flex-wrap gap-2">
            {mustSubmitDaily(ctx) ? (
              <Button onClick={() => setDailyOpen(true)} disabled={Boolean(todayReport)}>
                <Plus />
                Báo cáo hôm nay
              </Button>
            ) : null}
            {canCreateWeekly(ctx) ? (
              <Button variant="secondary" onClick={() => setWeeklyOpen(true)}>
                <Plus />
                Báo cáo tuần
              </Button>
            ) : null}
          </div>
        }
      />

      {todayReport ? (
        <p className="text-helper text-text-muted">
          Báo cáo hôm nay đang ở trạng thái {REPORT_STATUS_LABEL[todayReport.status]}. Mở chi tiết để
          xem hoặc chỉnh sửa.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Lọc theo trạng thái">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {REPORT_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {REPORT_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger aria-label="Lọc theo Team">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả Team</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={authorFilter} onValueChange={setAuthorFilter}>
          <SelectTrigger aria-label="Lọc theo người gửi">
            <SelectValue placeholder="Người gửi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả người gửi</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          aria-label="Từ ngày"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          aria-label="Đến ngày"
        />
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Báo cáo ngày</TabsTrigger>
          <TabsTrigger value="weekly">Báo cáo tuần</TabsTrigger>
          <TabsTrigger value="my-review">Chờ tôi duyệt{myQueueCount ? ` (${myQueueCount})` : ""}</TabsTrigger>
          <TabsTrigger value="workflow">Xử lý báo cáo</TabsTrigger>
          <TabsTrigger value="summary">Tổng hợp Team</TabsTrigger>
          <TabsTrigger value="stats">Thống kê</TabsTrigger>
          <TabsTrigger value="archive">Lưu trữ</TabsTrigger>
          {canViewObligations ? (
            <TabsTrigger value="obligations">Nghĩa vụ</TabsTrigger>
          ) : null}
          {canConfigReports ? <TabsTrigger value="config">Cấu hình</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="stats" className="flex flex-col gap-3">
          <ReportStatsPanel />
        </TabsContent>
        <TabsContent value="archive" className="flex flex-col gap-3">
          <ReportArchivePanel />
        </TabsContent>
        <TabsContent value="workflow" className="flex flex-col gap-3">
          <ReportDocList />
        </TabsContent>
        <TabsContent value="summary" className="flex flex-col gap-3">
          <TeamSummaryPanel />
        </TabsContent>

        <TabsContent value="my-review" className="flex flex-col gap-4">
          <span className="text-caption text-text-muted">
            {myQueueCount} báo cáo đang chờ chính bạn duyệt
          </span>
          <div className="flex flex-col gap-2">
            <p className="text-label font-semibold text-text-primary">Báo cáo ngày</p>
            <DataTable
              columns={dailyColumns}
              data={myDailyQueue}
              getRowId={(row) => row.id}
              loading={dailyResult.isLoading}
              emptyTitle="Không có báo cáo ngày chờ bạn duyệt"
              emptyDescription="Chỉ báo cáo có bạn là người duyệt hiện tại mới xuất hiện tại đây."
              onRowClick={(row) => openDetail("daily", row.id)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-label font-semibold text-text-primary">Báo cáo tuần</p>
            <DataTable
              columns={weeklyColumns}
              data={myWeeklyQueue}
              getRowId={(row) => row.id}
              loading={weeklyResult.isLoading}
              emptyTitle="Không có báo cáo tuần chờ bạn duyệt"
              emptyDescription="Chỉ báo cáo có bạn là người duyệt hiện tại mới xuất hiện tại đây."
              onRowClick={(row) => openDetail("weekly", row.id)}
            />
          </div>
        </TabsContent>

        <TabsContent value="daily" className="flex flex-col gap-3">
          <span className="text-caption text-text-muted">{dailyRows.length} báo cáo ngày</span>
          <DataTable
            columns={dailyColumns}
            data={dailyRows}
            getRowId={(row) => row.id}
            loading={dailyResult.isLoading}
            error={dailyResult.isError}
            onRetry={() => void dailyResult.refetch()}
            errorTitle="Không tải được báo cáo ngày"
            emptyTitle="Chưa có báo cáo ngày nào"
            emptyDescription="Báo cáo ngày sẽ xuất hiện tại đây sau khi được tạo."
            rowClassName={(row) =>
              awaitsMeDaily(row) ? "border-l-2 border-l-state-warning bg-state-warning/5" : undefined
            }
            onRowClick={(row) => openDetail("daily", row.id)}
          />
        </TabsContent>
        <TabsContent value="weekly" className="flex flex-col gap-3">
          <span className="text-caption text-text-muted">{weeklyRows.length} báo cáo tuần</span>
          <DataTable
            columns={weeklyColumns}
            data={weeklyRows}
            getRowId={(row) => row.id}
            loading={weeklyResult.isLoading}
            error={weeklyResult.isError}
            onRetry={() => void weeklyResult.refetch()}
            errorTitle="Không tải được báo cáo tuần"
            emptyTitle="Chưa có báo cáo tuần nào"
            emptyDescription="Leader tạo báo cáo tuần cho Team để tổng hợp kết quả."
            rowClassName={(row) =>
              awaitsMeWeekly(row)
                ? "border-l-2 border-l-state-warning bg-state-warning/5"
                : undefined
            }
            onRowClick={(row) => openDetail("weekly", row.id)}
          />
        </TabsContent>
        {canViewObligations ? (
          <TabsContent value="obligations" className="flex flex-col gap-3">
            <ReportObligationsPanel />
          </TabsContent>
        ) : null}
        {canConfigReports ? (
          <TabsContent value="config" className="flex flex-col gap-3">
            <ReportConfigPanel />
          </TabsContent>
        ) : null}
      </Tabs>

      {access.userId ? (
        <DailyReportDrawer
          open={dailyOpen}
          onOpenChange={setDailyOpen}
          report={null}
          authorId={access.userId}
          teamId={me?.primary_team_id ?? null}
          onSaved={(id) =>
            void navigate({ to: "/reports/daily/$reportId", params: { reportId: id } })
          }
        />
      ) : null}

      {access.userId && access.leaderTeamId ? (
        <WeeklyReportDrawer
          open={weeklyOpen}
          onOpenChange={setWeeklyOpen}
          report={null}
          teamId={access.leaderTeamId}
          leaderId={access.userId}
          onSaved={(id) =>
            void navigate({ to: "/reports/weekly/$reportId", params: { reportId: id } })
          }
        />
      ) : null}

      <ReportReviewDrawer
        kind={detail?.kind ?? "daily"}
        reportId={detail?.id ?? null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
