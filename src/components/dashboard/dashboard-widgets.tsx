import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DashPanel, DrillLink, RateBar, StatPill } from "@/components/dashboard/dashboard-shell";
import { DASH_HINT, formatRate } from "@/lib/dashboard";
import type {
  DashAttentionItem,
  DashMemberRow,
  DashOpsAlert,
  DashProjectRow,
  DashQuality,
  DashReportStatus,
  DashTeamAverage,
  DashTeamRow,
  DashTrendPoint,
  DashWorkloadSlice,
  DashPersonal,
} from "@/lib/dashboard";

/**
 * DASH-CORE-01 — các widget của Dashboard hiệu suất.
 * Mỗi widget tự có empty state riêng; lỗi một widget không làm hỏng toàn trang.
 * Không xếp hạng, không điểm tổng hợp: chỉ mô tả số liệu và điều hướng.
 */
const AXIS = "var(--text-muted)";
const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  fontSize: 12,
} as const;

export function TrendPanel({
  points,
  granularity,
  title,
}: {
  points: DashTrendPoint[];
  granularity: "day" | "week" | "month";
  title: string;
}) {
  const hasData = points.some((p) => p.done > 0 || p.completion_rate !== null);
  const unit =
    granularity === "week" ? "8 tuần gần nhất" : granularity === "month" ? "6 tháng gần nhất" : "theo ngày";
  const data = points.map((p) => ({
    label: p.label,
    completion: p.completion_rate === null ? null : Math.round(p.completion_rate * 100),
    ontime: p.on_time_rate === null ? null : Math.round(p.on_time_rate * 100),
    done: p.done,
  }));
  return (
    <DashPanel
      title={title}
      hint={`Tỷ lệ hoàn thành và đúng hạn ${unit} (giờ Hà Nội). ${DASH_HINT.completion_rate}`}
      empty={hasData ? null : "Chưa đủ dữ liệu Task trong khoảng thời gian này."}
    >
      <div className="h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
            <XAxis dataKey="label" stroke={AXIS} fontSize={11} />
            <YAxis domain={[0, 100]} unit="%" stroke={AXIS} fontSize={11} />
            <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
            <Line
              type="monotone"
              dataKey="completion"
              name="Hoàn thành"
              stroke="var(--brand-primary)"
              strokeWidth={2}
              connectNulls
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="ontime"
              name="Đúng hạn"
              stroke="var(--state-success)"
              strokeWidth={2}
              connectNulls
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashPanel>
  );
}

export function TeamComparePanel({
  rows,
  from,
  to,
}: {
  rows: DashTeamRow[];
  from: string;
  to: string;
}) {
  return (
    <DashPanel
      title="So sánh các Team"
      hint="So sánh bằng tỷ lệ chuẩn hóa. Tổng số Task chỉ mô tả quy mô, không dùng để kết luận Team nào tốt hơn. Không có điểm tổng hợp và không xếp hạng."
      empty={rows.length === 0 ? "Chưa có Team nào trong phạm vi xem." : null}
    >
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-text-muted">
            <tr className="border-b border-border-default">
              <th className="py-2 text-left font-medium">Team</th>
              <th className="py-2 text-right font-medium">Hoàn thành</th>
              <th className="py-2 text-right font-medium">Đúng hạn</th>
              <th className="py-2 text-right font-medium">Quá hạn</th>
              <th className="py-2 text-right font-medium">Đang mở</th>
              <th className="py-2 text-right font-medium">Yêu cầu sửa</th>
              <th className="py-2 text-right font-medium">Quy mô</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.team_id}
                className={row.needs_attention ? "bg-state-warning-surface/40" : undefined}
              >
                <td className="py-2 pr-3">
                  <DrillLink
                    target={{ to: "/tasks", search: { team: row.team_id, from, to } }}
                    className="font-medium hover:underline"
                  >
                    {row.team_name}
                  </DrillLink>
                  {row.needs_attention ? (
                    <span className="ml-2 align-middle">
                      <Badge variant="warning">Cần chú ý</Badge>
                    </span>
                  ) : null}
                  {row.attention_reasons.length > 0 ? (
                    <p className="text-xs text-text-muted">{row.attention_reasons.join(" · ")}</p>
                  ) : null}
                </td>
                <td className="py-2 text-right tabular-nums">{formatRate(row.completion_rate)}</td>
                <td className="py-2 text-right tabular-nums">{formatRate(row.on_time_rate)}</td>
                <td className="py-2 text-right tabular-nums">{formatRate(row.overdue_rate)}</td>
                <td className="py-2 text-right tabular-nums">{row.open_tasks}</td>
                <td className="py-2 text-right tabular-nums">{row.changes_requested}</td>
                <td className="py-2 text-right text-xs text-text-muted tabular-nums">
                  {row.members} người · {row.tasks} Task
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashPanel>
  );
}

export function WorkloadPanel({ slices }: { slices: DashWorkloadSlice[] }) {
  const data = slices.map((s) => ({ label: s.team_name, value: s.open_tasks }));
  const hasData = data.some((d) => d.value > 0);
  return (
    <DashPanel
      title="Phân bổ khối lượng theo Team"
      hint={DASH_HINT.open_tasks}
      empty={hasData ? null : "Không có Task đang mở trong phạm vi này."}
    >
      <div className="h-56 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
            <XAxis dataKey="label" stroke={AXIS} fontSize={11} interval={0} />
            <YAxis allowDecimals={false} stroke={AXIS} fontSize={11} />
            <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="value" name="Task đang mở" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashPanel>
  );
}

export function ProjectsPanel({ projects }: { projects: DashProjectRow[] }) {
  const flagged = projects.filter((p) => p.overdue_tasks > 0 || p.stale_days !== null).slice(0, 8);
  return (
    <DashPanel
      title="Dự án cần chú ý"
      hint={`Dự án có Task quá hạn hoặc không có cập nhật nghiệp vụ trong 7 ngày. Tiến độ: ${DASH_HINT.project_progress}`}
      action={{ target: { to: "/projects" }, label: "Tất cả dự án" }}
      empty={flagged.length === 0 ? "Không có dự án nào cần chú ý trong phạm vi này." : null}
    >
      <ul className="space-y-2.5">
        {flagged.map((project) => (
          <li key={project.id} className="min-w-0">
            <DrillLink
              target={{ to: "/projects/$projectId", params: { projectId: project.id } }}
              className="block min-w-0 rounded-control border border-border-default p-2.5 hover:bg-surface-subtle"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <span className="truncate text-sm font-medium">{project.name}</span>
                <span className="shrink-0 text-xs text-text-muted tabular-nums">
                  {project.done}/{project.total}
                </span>
              </div>
              <div className="mt-1.5">
                <RateBar value={project.progress} />
              </div>
              <p className="mt-1 truncate text-xs text-text-muted">
                {project.team_name ? `${project.team_name} · ` : ""}
                {project.overdue_tasks > 0 ? `${project.overdue_tasks} Task quá hạn` : "Không có Task quá hạn"}
                {project.stale_days !== null ? ` · Không cập nhật ${project.stale_days} ngày` : ""}
              </p>
            </DrillLink>
          </li>
        ))}
      </ul>
    </DashPanel>
  );
}

export function TeamProjectsPanel({ projects }: { projects: DashProjectRow[] }) {
  return (
    <DashPanel
      title="Tiến độ dự án của Team"
      hint={DASH_HINT.project_progress}
      empty={projects.length === 0 ? "Team chưa có dự án đang chạy." : null}
    >
      <ul className="space-y-2.5">
        {projects.slice(0, 8).map((project) => (
          <li key={project.id} className="min-w-0">
            <DrillLink
              target={{ to: "/projects/$projectId", params: { projectId: project.id } }}
              className="block min-w-0 hover:opacity-90"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <span className="truncate text-sm">{project.name}</span>
                <span className="shrink-0 text-xs text-text-muted tabular-nums">
                  {formatRate(project.progress)}
                </span>
              </div>
              <div className="mt-1">
                <RateBar value={project.progress} />
              </div>
            </DrillLink>
          </li>
        ))}
      </ul>
    </DashPanel>
  );
}

export function AttentionPanel({
  items,
  title,
}: {
  items: DashAttentionItem[];
  title: string;
}) {
  return (
    <DashPanel
      title={title}
      hint="Task đang quá hạn, đến hạn trong kỳ, chờ kiểm tra hoặc đang bị yêu cầu sửa. Bấm để mở chi tiết Task."
      action={{ target: { to: "/tasks" }, label: "Mở danh sách" }}
      empty={items.length === 0 ? "Không có công việc nào cần chú ý." : null}
    >
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <DrillLink
              target={item.drill}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-control border border-border-default p-2.5 hover:bg-surface-subtle"
            >
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm font-medium">{item.title}</span>
                <span className="block truncate text-xs text-text-muted">{item.meta}</span>
              </span>
              <Badge
                variant={
                  item.kind === "overdue"
                    ? "error"
                    : item.kind === "changes_requested"
                      ? "warning"
                      : "neutral"
                }
              >
                {item.kind === "overdue"
                  ? "Quá hạn"
                  : item.kind === "changes_requested"
                    ? "Cần sửa"
                    : item.kind === "review"
                      ? "Chờ kiểm tra"
                      : "Đến hạn"}
              </Badge>
            </DrillLink>
          </li>
        ))}
      </ul>
    </DashPanel>
  );
}

export function MembersPanel({ rows }: { rows: DashMemberRow[] }) {
  return (
    <DashPanel
      title="Phân bổ công việc theo thành viên"
      hint={DASH_HINT.overload}
      empty={rows.length === 0 ? "Team chưa có thành viên đang hoạt động." : null}
    >
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs text-text-muted">
            <tr className="border-b border-border-default">
              <th className="py-2 text-left font-medium">Thành viên</th>
              <th className="py-2 text-right font-medium">Đang mở</th>
              <th className="py-2 text-right font-medium">Quá hạn</th>
              <th className="py-2 text-right font-medium">Đúng hạn</th>
              <th className="py-2 text-right font-medium">Yêu cầu sửa</th>
              <th className="py-2 text-right font-medium">Báo cáo muộn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.user_id}>
                <td className="py-2 pr-3">
                  <DrillLink
                    target={{ to: "/tasks", search: { assignee: row.user_id } }}
                    className="hover:underline"
                  >
                    {row.display_name}
                  </DrillLink>
                  <span className="ml-2 align-middle">
                    <Badge
                      variant={
                        row.load === "over" ? "warning" : row.load === "under" ? "neutral" : "success"
                      }
                    >
                      {row.load === "over" ? "Quá tải" : row.load === "under" ? "Thiếu việc" : "Cân bằng"}
                    </Badge>
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{row.open_tasks}</td>
                <td className="py-2 text-right tabular-nums">{row.overdue}</td>
                <td className="py-2 text-right tabular-nums">{formatRate(row.on_time_rate)}</td>
                <td className="py-2 text-right tabular-nums">{row.changes_requested}</td>
                <td className="py-2 text-right tabular-nums">{row.late_reports}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashPanel>
  );
}

export function QualityPanel({ quality }: { quality: DashQuality }) {
  return (
    <DashPanel title="Chất lượng công việc" hint={DASH_HINT.first_pass}>
      <div className="grid gap-2 sm:grid-cols-2">
        <StatPill
          label="Số lần yêu cầu sửa"
          value={String(quality.changes_requested)}
          tone={quality.changes_requested > 0 ? "warning" : "default"}
        />
        <StatPill
          label="Qua kiểm tra lần đầu"
          value={quality.evaluated_tasks === 0 ? "—" : formatRate(quality.first_pass_rate)}
          tone="success"
        />
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {quality.evaluated_tasks === 0
          ? "Chưa có quyết định kiểm tra nào trong kỳ."
          : `Tính trên ${quality.evaluated_tasks} Task có quyết định kiểm tra trong kỳ.`}
        {quality.status === "historical_data_incomplete"
          ? " Một phần khoảng thời gian nằm trước khi hệ thống bắt đầu ghi lịch sử phê duyệt nên dữ liệu lịch sử chưa đầy đủ."
          : ""}
      </p>
    </DashPanel>
  );
}

export function ReportsPanel({
  reports,
  from,
  to,
  teamId,
}: {
  reports: DashReportStatus;
  from: string;
  to: string;
  teamId: string | null;
}) {
  return (
    <DashPanel
      title="Tình trạng báo cáo"
      hint="Tính từ nghĩa vụ báo cáo có hạn nộp trong kỳ, không tính trường hợp được miễn. Báo cáo gửi lại không bị tính muộn nếu lần gửi đầu đúng hạn."
      action={{
        target: { to: "/reports", search: { from, to, ...(teamId ? { team: teamId } : {}) } },
        label: "Mở báo cáo",
      }}
      empty={reports.required === 0 ? "Không có nghĩa vụ báo cáo nào trong kỳ." : null}
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatPill label="Đã nộp" value={String(reports.submitted)} />
        <StatPill label="Đúng hạn" value={String(reports.on_time)} tone="success" />
        <StatPill
          label="Muộn hoặc chưa nộp"
          value={String(reports.late_or_missing)}
          tone={reports.late_or_missing > 0 ? "warning" : "default"}
        />
        <StatPill label="Chờ duyệt" value={String(reports.pending_review)} />
      </div>
    </DashPanel>
  );
}

export function OpsAlertsPanel({ alerts }: { alerts: DashOpsAlert[] }) {
  return (
    <DashPanel
      title="Cảnh báo điều hành"
      hint="Cảnh báo nhân sự và công việc theo Business Rule hiện có (quá hạn, quá tải, phân bổ mất cân đối, Task bị sửa nhiều lần, dự án đình trệ)."
      empty={alerts.length === 0 ? "Không có cảnh báo điều hành nào trong kỳ." : null}
    >
      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li key={alert.id}>
            <DrillLink
              target={alert.drill}
              className="flex min-w-0 items-start gap-2 rounded-control border border-border-default p-2.5 text-sm hover:bg-surface-subtle"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-warning" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium">{alert.subject}</span>{" "}
                <span className="text-text-muted">{alert.detail}</span>
              </span>
            </DrillLink>
          </li>
        ))}
      </ul>
    </DashPanel>
  );
}

export function PersonalProgressPanel({ personal }: { personal: DashPersonal }) {
  return (
    <DashPanel title="Tiến độ công việc cá nhân" hint={DASH_HINT.completion_rate}>
      <div className="grid grid-cols-2 gap-2">
        <StatPill label="Tỷ lệ hoàn thành" value={formatRate(personal.completion_rate)} />
        <StatPill label="Tỷ lệ đúng hạn" value={formatRate(personal.on_time_rate)} tone="success" />
        <StatPill label="Task hoàn thành" value={String(personal.completed_tasks)} />
        <StatPill label="Task đang mở" value={String(personal.open_tasks)} />
      </div>
      <div className="mt-3">
        <RateBar value={personal.completion_rate} />
      </div>
    </DashPanel>
  );
}

export function TeamAveragePanel({
  average,
  personal,
}: {
  average: DashTeamAverage | null;
  personal: DashPersonal;
}) {
  const unavailable =
    !average || average.status !== "ok"
      ? average?.status === "no_team"
        ? "Bạn chưa thuộc Team nào nên chưa có dữ liệu để so sánh."
        : "Chưa đủ dữ liệu Team để so sánh."
      : null;
  return (
    <DashPanel
      title="So sánh với trung bình Team"
      hint="Chỉ hiển thị chỉ số tổng hợp của Team, không hiển thị tên hay số liệu của đồng nghiệp. Team có dưới 3 thành viên hoạt động sẽ không hiển thị giá trị trung bình."
      empty={unavailable}
    >
      {average && average.status === "ok" ? (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead className="text-xs text-text-muted">
              <tr className="border-b border-border-default">
                <th className="py-2 text-left font-medium">Chỉ số</th>
                <th className="py-2 text-right font-medium">Bạn</th>
                <th className="py-2 text-right font-medium">Trung bình Team</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2">Tỷ lệ hoàn thành</td>
                <td className="py-2 text-right tabular-nums">{formatRate(personal.completion_rate)}</td>
                <td className="py-2 text-right tabular-nums">{formatRate(average.completion_rate)}</td>
              </tr>
              <tr>
                <td className="py-2">Tỷ lệ đúng hạn</td>
                <td className="py-2 text-right tabular-nums">{formatRate(personal.on_time_rate)}</td>
                <td className="py-2 text-right tabular-nums">{formatRate(average.on_time_rate)}</td>
              </tr>
              <tr>
                <td className="py-2">Task hoàn thành</td>
                <td className="py-2 text-right tabular-nums">{personal.completed_tasks}</td>
                <td className="py-2 text-right tabular-nums">{average.completed_tasks ?? "—"}</td>
              </tr>
              <tr>
                <td className="py-2">Task đang mở</td>
                <td className="py-2 text-right tabular-nums">{personal.open_tasks}</td>
                <td className="py-2 text-right tabular-nums">{average.open_tasks ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </DashPanel>
  );
}
