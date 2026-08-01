import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, TableCellStack, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useOrgAccess } from "@/hooks/use-org-access";
import { membersQuery, teamsQuery } from "@/lib/org-data";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  OBLIGATION_STATE_LABEL,
  OBLIGATION_STATE_TONE,
  REPORT_KIND_LABEL,
  obligationState,
  reportObligationsQuery,
  type ReportKind,
  type ReportObligationRow,
} from "@/lib/report-obligation-data";
import {
  filterObligations,
  groupObligations,
  summarizeObligations,
  type ReportStatsGroup,
} from "@/lib/report-stats-data";

/**
 * CEN 1.0 — REPORT-03: thống kê báo cáo theo vai trò.
 * Member: số liệu của mình. Leader: Team mình. CMO/Admin: toàn hệ thống.
 * Dữ liệu lấy từ nghĩa vụ báo cáo, phạm vi do RLS quyết định — UI không nới quyền.
 */
const ALL = "__all__";

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Clock;
  tone: "default" | "success" | "warning" | "error";
}) {
  const toneClass =
    tone === "success"
      ? "text-status-success"
      : tone === "warning"
        ? "text-status-warning"
        : tone === "error"
          ? "text-status-error"
          : "text-text-primary";
  return (
    <Card>
      <CardContent className="flex items-start gap-3 pt-(--card-pad)">
        <span className="grid size-9 shrink-0 place-items-center rounded-control border border-border-default bg-surface-subtle text-text-muted">
          <Icon className="size-icon-md" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-text-secondary">{label}</p>
          <p className={`text-xl font-semibold ${toneClass}`}>{value}</p>
          {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function GroupTable({ title, rows }: { title: string; rows: ReportStatsGroup[] }) {
  if (rows.length === 0) return null;
  const columns: DataTableColumn<ReportStatsGroup>[] = [
    {
      id: "label",
      header: title,
      cell: (row: ReportStatsGroup) => (
        <TableCellStack primary={row.label} secondary={`${row.total} nghĩa vụ`} />
      ),
    },
    { id: "submitted", header: "Đúng hạn", className: "w-[96px]", cell: (row: ReportStatsGroup) => row.submitted },
    { id: "late", header: "Gửi trễ", className: "w-[88px]", cell: (row: ReportStatsGroup) => row.lateSubmitted },
    { id: "overdue", header: "Quá hạn", className: "w-[88px]", cell: (row: ReportStatsGroup) => row.overdue },
    { id: "pending", header: "Chưa gửi", className: "w-[96px]", cell: (row: ReportStatsGroup) => row.pending },
    {
      id: "rate",
      header: "Đúng hạn",
      className: "w-[96px]",
      cell: (row: ReportStatsGroup) => percent(row.onTimeRate),
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="hidden md:block">
          <DataTable data={rows} columns={columns} getRowId={(row) => row.key} density="compact" />
        </div>
        <div className="space-y-2 md:hidden">
          {rows.map((row) => (
            <div key={`m-${row.key}`} className="rounded-control border border-border-default p-3">
              <p className="font-medium">{row.label}</p>
              <p className="text-sm text-text-secondary">
                Đúng hạn {row.submitted} · Trễ {row.lateSubmitted} · Quá hạn {row.overdue} · Chưa gửi{" "}
                {row.pending}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportStatsPanel() {
  const access = useOrgAccess();
  const obligations = useQuery(reportObligationsQuery());
  const teamsResult = useQuery(teamsQuery());
  const membersResult = useQuery(membersQuery());

  const scope = access.isCmo || access.isSystemAdmin ? "org" : access.isLeader ? "team" : "me";

  const [from, setFrom] = React.useState(isoDaysAgo(30));
  const [to, setTo] = React.useState(isoDaysAgo(-1));
  const [kind, setKind] = React.useState<string>(ALL);
  const [teamId, setTeamId] = React.useState<string>(ALL);
  const [userId, setUserId] = React.useState<string>(ALL);

  const rows = React.useMemo(() => {
    const base = obligations.data ?? [];
    return filterObligations(base, {
      from,
      to,
      reportType: kind === ALL ? null : (kind as ReportKind),
      teamId: teamId === ALL ? null : teamId,
      userId: scope === "me" ? access.userId : userId === ALL ? null : userId,
    });
  }, [obligations.data, from, to, kind, teamId, userId, scope, access.userId]);

  const summary = React.useMemo(() => summarizeObligations(rows), [rows]);
  const byTeam = React.useMemo(() => (scope === "org" ? groupObligations(rows, "team") : []), [rows, scope]);
  const byPerson = React.useMemo(
    () => (scope === "me" ? [] : groupObligations(rows, "person").slice(0, 20)),
    [rows, scope],
  );
  const attention = React.useMemo(
    () =>
      rows
        .filter((row) => {
          const state = obligationState(row);
          return state === "overdue" || state === "pending";
        })
        .sort((a, b) => a.due_at.localeCompare(b.due_at))
        .slice(0, 25),
    [rows],
  );

  if (obligations.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
    );
  }

  if (obligations.isError) {
    return (
      <ErrorState
        title="Không tải được thống kê báo cáo"
        onRetry={() => void obligations.refetch()}
      />
    );
  }

  const attentionColumns: DataTableColumn<ReportObligationRow>[] = [
    {
      id: "who",
      header: "Người phải gửi",
      cell: (row: ReportObligationRow) => (
        <TableCellStack primary={row.userName ?? "—"} secondary={row.teamName ?? "Chưa thuộc Team"} />
      ),
    },
    {
      id: "period",
      header: "Kỳ",
      className: "w-[180px]",
      cell: (row: ReportObligationRow) =>
        `${REPORT_KIND_LABEL[row.report_type]} — ${row.period_key}`,
    },
    {
      id: "due",
      header: "Hạn",
      className: "w-[160px]",
      cell: (row: ReportObligationRow) => formatHanoiDateTime(row.due_at),
    },
    {
      id: "state",
      header: "Trạng thái",
      className: "w-[130px]",
      cell: (row: ReportObligationRow) => {
        const state = obligationState(row);
        return (
          <StatusBadge
            label={OBLIGATION_STATE_LABEL[state]}
            tone={OBLIGATION_STATE_TONE[state]}
          />
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 pt-(--card-pad) sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <label className="text-xs text-text-secondary" htmlFor="stats-from">
              Từ ngày
            </label>
            <Input
              id="stats-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-secondary" htmlFor="stats-to">
              Đến ngày
            </label>
            <Input
              id="stats-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-text-secondary">Loại báo cáo</span>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả loại</SelectItem>
                {(Object.keys(REPORT_KIND_LABEL) as ReportKind[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {REPORT_KIND_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scope === "org" ? (
            <div className="space-y-1">
              <span className="text-xs text-text-secondary">Team</span>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả Team</SelectItem>
                  {(teamsResult.data ?? []).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {scope !== "me" ? (
            <div className="space-y-1">
              <span className="text-xs text-text-secondary">Thành viên</span>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả thành viên</SelectItem>
                  {(membersResult.data ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Gửi đúng hạn"
          value={String(summary.submitted)}
          hint={`Tỷ lệ đúng hạn ${percent(summary.onTimeRate)}`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Gửi trễ"
          value={String(summary.lateSubmitted)}
          hint={`Tỷ lệ hoàn thành ${percent(summary.complianceRate)}`}
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="Quá hạn chưa gửi"
          value={String(summary.overdue)}
          hint={`Chưa đến hạn: ${summary.upcoming}`}
          icon={AlertTriangle}
          tone="error"
        />
        <StatCard
          label="Được miễn"
          value={String(summary.exempt)}
          hint={`Tổng nghĩa vụ: ${summary.total}`}
          icon={ShieldCheck}
          tone="default"
        />
      </div>

      <GroupTable title="Theo Team" rows={byTeam} />
      <GroupTable title="Theo thành viên" rows={byPerson} />

      <Card>
        <CardHeader>
          <CardTitle>Cần xử lý</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {attention.length === 0 ? (
            <EmptyState
              variant="compact"
              title="Không có nghĩa vụ nào quá hạn hoặc chưa gửi"
              description="Trong khoảng thời gian đang lọc."
            />
          ) : (
            <>
              <div className="hidden md:block">
                <DataTable
                  data={attention}
                  columns={attentionColumns}
                  getRowId={(row) => row.id}
                  density="compact"
                />
              </div>
              <div className="space-y-2 md:hidden">
                {attention.map((row) => {
                  const state = obligationState(row);
                  return (
                    <div key={row.id} className="rounded-control border border-border-default p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.userName ?? "—"}</p>
                          <p className="text-sm text-text-secondary">
                            {REPORT_KIND_LABEL[row.report_type]} — {row.period_key}
                          </p>
                        </div>
                        <StatusBadge
                          label={OBLIGATION_STATE_LABEL[state]}
                          tone={OBLIGATION_STATE_TONE[state]}
                        />
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        Hạn {formatHanoiDateTime(row.due_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
