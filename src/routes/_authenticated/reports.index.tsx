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
import { useOrgAccess } from "@/hooks/use-org-access";
import { membersQuery, teamsQuery } from "@/lib/org-data";
import { formatHanoiDate } from "@/lib/datetime";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_ORDER,
  REPORT_STATUS_TONE,
  canCreateWeekly,
  dailyReportsQuery,
  formatWeekLabel,
  hanoiToday,
  mustSubmitDaily,
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

  const teams = teamsResult.data ?? [];
  const members = membersResult.data ?? [];
  const me = members.find((member) => member.id === access.userId) ?? null;

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

  const dailyColumns = [
    {
      id: "date",
      header: "Ngày",
      className: "min-w-[130px]",
      cell: (row: DailyReportRow) => (
        <TableCellStack primary={formatHanoiDate(row.report_date)} secondary={row.teamName ?? "—"} />
      ),
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
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[160px]",
      cell: (row: DailyReportRow) => (
        <StatusBadge label={REPORT_STATUS_LABEL[row.status]} tone={REPORT_STATUS_TONE[row.status]} />
      ),
    },
  ];

  const weeklyColumns = [
    {
      id: "week",
      header: "Tuần",
      className: "min-w-[200px]",
      cell: (row: WeeklyReportRow) => (
        <TableCellStack
          primary={formatWeekLabel(row.week_start)}
          secondary={row.teamName ?? "—"}
        />
      ),
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
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[160px]",
      cell: (row: WeeklyReportRow) => (
        <StatusBadge label={REPORT_STATUS_LABEL[row.status]} tone={REPORT_STATUS_TONE[row.status]} />
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
        </TabsList>
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
            onRowClick={(row) =>
              void navigate({ to: "/reports/daily/$reportId", params: { reportId: row.id } })
            }
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
            onRowClick={(row) =>
              void navigate({ to: "/reports/weekly/$reportId", params: { reportId: row.id } })
            }
          />
        </TabsContent>
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
    </div>
  );
}
