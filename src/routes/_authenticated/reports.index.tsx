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
import { ReportReviewDrawer } from "@/components/report/report-review-drawer";

import { cn } from "@/lib/utils";
import { useOrgAccess } from "@/hooks/use-org-access";
import { useReviewerDirectory } from "@/hooks/use-reviewer-directory";
import { membersQuery, teamsQuery } from "@/lib/org-data";
import { formatHanoiDate } from "@/lib/datetime";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_ORDER,
  canCreateWeekly,
  canReviewDaily,
  canReviewWeekly,
  dailyReportsQuery,
  dailyReviewerView,
  formatWeekLabel,
  hanoiToday,
  isReviewOverdue,
  mustSubmitDaily,
  reportStatusView,
  weekStartOf,
  weeklyReportsQuery,
  weeklyReviewerView,
  weekNumberLabel,
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

/** REPORT-UI-STATUS-NAV-01 — 5 chip tóm tắt trạng thái báo cáo ngày. */
type DailyChip = "submitted" | "missing" | "pending" | "approved" | "changes";

const DAILY_CHIP_LABEL: Record<DailyChip, string> = {
  submitted: "Đã nộp",
  missing: "Chưa nộp",
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  changes: "Yêu cầu sửa",
};

const DAILY_CHIP_ORDER: DailyChip[] = ["submitted", "missing", "pending", "approved", "changes"];

interface MissingRow {
  id: string;
  name: string;
  teamName: string | null;
}

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
  // REPORT-DAILY-LIST-01 — tab "Báo cáo ngày" mặc định chỉ hôm nay (giờ Hà Nội).
  const [dailyDate, setDailyDate] = React.useState(() => hanoiToday());
  const [dailyChip, setDailyChip] = React.useState<DailyChip>("submitted");
  const [archiveKind, setArchiveKind] = React.useState<"daily" | "weekly">("daily");
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

  /** Báo cáo của đúng ngày đang chọn, dùng cho chip và bảng tab Báo cáo ngày. */
  const dayRows = React.useMemo(
    () => dailyRows.filter((row) => row.report_date === dailyDate),
    [dailyRows, dailyDate],
  );

  const teamNameOf = React.useCallback(
    (teamId: string | null) => teams.find((team) => team.id === teamId)?.name ?? null,
    [teams],
  );

  /** Chỉ Member/Leader đang hoạt động mới bị tính "Chưa nộp"; Admin/CMO được miễn. */
  const missingRows = React.useMemo<MissingRow[]>(() => {
    const submittedAuthors = new Set(
      dayRows.filter((row) => row.status !== "draft").map((row) => row.author_id),
    );
    return members
      .filter((member) => member.status === "active" && !member.locked_at)
      .filter((member) => member.role === "member" || member.role === "leader")
      .filter((member) => !submittedAuthors.has(member.id))
      .filter((member) => (teamFilter === ALL ? true : member.primary_team_id === teamFilter))
      .filter((member) => (authorFilter === ALL ? true : member.id === authorFilter))
      .map((member) => ({
        id: member.id,
        name: member.display_name,
        teamName: teamNameOf(member.primary_team_id),
      }));
  }, [members, dayRows, teamFilter, authorFilter, teamNameOf]);

  const counts: Record<DailyChip, number> = {
    submitted: dayRows.filter((row) => row.status !== "draft").length,
    missing: missingRows.length,
    pending: dayRows.filter((row) => row.status === "submitted").length,
    approved: dayRows.filter((row) => row.status === "approved").length,
    changes: dayRows.filter((row) => row.status === "changes_requested").length,
  };

  const chipRows = React.useMemo(() => {
    switch (dailyChip) {
      case "pending":
        return dayRows.filter((row) => row.status === "submitted");
      case "approved":
        return dayRows.filter((row) => row.status === "approved");
      case "changes":
        return dayRows.filter((row) => row.status === "changes_requested");
      default:
        return dayRows.filter((row) => row.status !== "draft");
    }
  }, [dayRows, dailyChip]);

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

  // Lưu trữ: báo cáo ngày trước hôm nay và báo cáo tuần đã qua tuần hiện tại.
  const currentWeekStart = weekStartOf(hanoiToday());
  const archiveDaily = dailyRows.filter((row) => row.report_date < hanoiToday());
  const archiveWeekly = weeklyRows.filter((row) => row.week_start < currentWeekStart);

  const dailyColumns = [
    {
      id: "author",
      header: "Người gửi",
      className: "min-w-[170px]",
      cell: (row: DailyReportRow) => (
        <TableCellStack
          primary={row.authorName ?? "—"}
          secondary={`${row.teamName ?? "Chưa có Team"} · ${formatHanoiDate(row.report_date)}`}
        />
      ),
    },
    {
      id: "reviewer",
      header: "Người duyệt",
      className: "min-w-[160px]",
      cell: (row: DailyReportRow) => {
        const view = dailyReviewerView(row, directory);
        if (view.name) return <span className="text-text-secondary">{view.name}</span>;
        return <span className="text-text-muted">—</span>;
      },
    },
    {
      id: "results",
      header: "Kết quả",
      className: "min-w-[260px]",
      cell: (row: DailyReportRow) => (
        <span className="line-clamp-2 max-w-[420px] text-text-secondary">{row.results ?? "—"}</span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[160px]",
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
  ];

  const missingColumns = [
    {
      id: "person",
      header: "Nhân sự",
      className: "min-w-[180px]",
      cell: (row: MissingRow) => <span className="text-text-primary">{row.name}</span>,
    },
    {
      id: "team",
      header: "Team",
      className: "min-w-[150px]",
      cell: (row: MissingRow) => (
        <span className="text-text-secondary">{row.teamName ?? "Chưa có Team"}</span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[160px]",
      cell: () => <StatusBadge label="Chưa nộp báo cáo" tone="warning" />,
    },
    {
      id: "note",
      header: "Ghi chú",
      className: "min-w-[200px]",
      cell: () => (
        <span className="text-text-muted">Chưa có báo cáo cho ngày {formatHanoiDate(dailyDate)}</span>
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
          primary={weekNumberLabel(row.week_start)}
          secondary={`${formatWeekLabel(row.week_start)} · ${row.teamName ?? "—"}`}
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
      cell: (row: WeeklyReportRow) => {
        const view = weeklyReviewerView(row, directory);
        return <span className="text-text-secondary">{view.name ?? "—"}</span>;
      },
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Báo cáo"
        description="Báo cáo ngày cá nhân và báo cáo tuần của Team trong hệ thống."
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
          <TabsTrigger value="my-review">
            Chờ tôi duyệt{myQueueCount ? ` (${myQueueCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="archive">Lưu trữ</TabsTrigger>
        </TabsList>

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
              emptyTitle="Không có báo cáo chờ bạn duyệt."
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
              emptyTitle="Không có báo cáo chờ bạn duyệt."
              emptyDescription="Chỉ báo cáo có bạn là người duyệt hiện tại mới xuất hiện tại đây."
              onRowClick={(row) => openDetail("weekly", row.id)}
            />
          </div>
        </TabsContent>

        <TabsContent value="daily" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="date"
              value={dailyDate}
              onChange={(event) => setDailyDate(event.target.value)}
              aria-label="Ngày báo cáo"
              className="w-auto"
            />
            <Button variant="secondary" size="sm" onClick={() => setDailyDate(hanoiToday())}>
              Hôm nay
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {DAILY_CHIP_ORDER.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setDailyChip(chip)}
                aria-pressed={dailyChip === chip}
                className={cn(
                  "cen-transition rounded-badge border px-3 py-1.5 text-label font-medium",
                  dailyChip === chip
                    ? "border-brand-primary bg-brand-primary text-brand-foreground"
                    : "border-border-default bg-background-elevated text-text-secondary hover:text-text-primary",
                )}
              >
                {DAILY_CHIP_LABEL[chip]}: {counts[chip]}
              </button>
            ))}
          </div>

          {dailyChip === "missing" ? (
            <DataTable
              columns={missingColumns}
              data={missingRows}
              getRowId={(row) => row.id}
              loading={membersResult.isLoading}
              emptyTitle="Tất cả nhân sự đã gửi báo cáo"
              emptyDescription={`Không còn ai chưa gửi báo cáo ngày ${formatHanoiDate(dailyDate)}.`}
            />
          ) : (
            <DataTable
              columns={dailyColumns}
              data={chipRows}
              getRowId={(row) => row.id}
              loading={dailyResult.isLoading}
              error={dailyResult.isError}
              onRetry={() => void dailyResult.refetch()}
              errorTitle="Không tải được báo cáo ngày"
              emptyTitle="Chưa có báo cáo phù hợp"
              emptyDescription="Chọn chip trạng thái khác hoặc đổi ngày để xem báo cáo."
              rowClassName={(row) =>
                awaitsMeDaily(row)
                  ? "border-l-2 border-l-state-warning bg-state-warning/5"
                  : undefined
              }
              onRowClick={(row) => openDetail("daily", row.id)}
            />
          )}
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

        <TabsContent value="archive" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={archiveKind}
              onValueChange={(value) => setArchiveKind(value as "daily" | "weekly")}
            >
              <SelectTrigger aria-label="Loại báo cáo" className="w-[190px]">
                <SelectValue placeholder="Loại báo cáo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Báo cáo ngày</SelectItem>
                <SelectItem value="weekly">Báo cáo tuần</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-caption text-text-muted">
              {archiveKind === "daily" ? archiveDaily.length : archiveWeekly.length} báo cáo cũ ·
              dùng bộ lọc Team, người gửi, trạng thái và khoảng ngày phía trên
            </span>
          </div>
          {archiveKind === "daily" ? (
            <DataTable
              columns={dailyColumns}
              data={archiveDaily}
              getRowId={(row) => row.id}
              loading={dailyResult.isLoading}
              emptyTitle="Chưa có báo cáo ngày cũ"
              emptyDescription="Báo cáo của các ngày trước sẽ được lưu tại đây."
              onRowClick={(row) => openDetail("daily", row.id)}
            />
          ) : (
            <DataTable
              columns={weeklyColumns}
              data={archiveWeekly}
              getRowId={(row) => row.id}
              loading={weeklyResult.isLoading}
              emptyTitle="Chưa có báo cáo tuần cũ"
              emptyDescription="Báo cáo của các tuần trước sẽ được lưu tại đây."
              onRowClick={(row) => openDetail("weekly", row.id)}
            />
          )}
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

      <ReportReviewDrawer
        kind={detail?.kind ?? "daily"}
        reportId={detail?.id ?? null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
