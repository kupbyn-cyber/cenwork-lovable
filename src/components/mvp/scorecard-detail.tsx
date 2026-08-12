import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatHanoiDate, formatHanoiDateTime } from "@/lib/datetime";
import { mvpBonusQuery, mvpComponentsQuery, type MvpComponentRow } from "@/lib/mvp-data";
import {
  MVP_ANNOUNCEMENT_BUCKET_LABEL,
  MVP_AUTO_MAX,
  MVP_BONUS_MAX,
  MVP_BONUS_STATUS_LABEL,
  MVP_CRITERION_LABEL,
  MVP_CRITERION_MAX,
  MVP_REVIEW_MAX,
  MVP_TASK_WEIGHT_LABEL,
  MVP_TOTAL_MAX,
  type MvpAnnouncementBucket,
  type MvpAnnouncementEvaluation,
  type MvpBonusStatus,
  type MvpCriterion,
  type MvpTaskWeight,
} from "@/lib/mvp-scoring";

/**
 * CEN 1.0 — MVP-FIX-05: giải thích và đối soát điểm MVP.
 * Toàn bộ số liệu đọc từ mvp_score_components (formula + source_data) đã lưu khi
 * tính điểm, nên kỳ đã khóa luôn hiển thị đúng ảnh chụp tại thời điểm chốt.
 */
export interface ScorecardDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  userId: string | null;
  userName: string;
  totalScore: number;
  teamName?: string | null;
  cycleLabel?: string | null;
  isLocked?: boolean;
  dataCompleteness?: number;
  isEligible?: boolean;
  ineligibleReason?: string | null;
  autoScore?: number;
  reviewScore?: number;
  voteScore?: number;
  bonusScore?: number;
  penaltyScore?: number;
}

type DataState = "ok" | "missing" | "not_applicable" | "incomplete" | "error";

const DATA_STATE_LABEL: Record<DataState, string> = {
  ok: "Có dữ liệu",
  missing: "Thiếu dữ liệu",
  not_applicable: "Không áp dụng",
  incomplete: "Chưa hoàn tất",
  error: "Lỗi dữ liệu",
};

const DATA_STATE_VARIANT: Record<DataState, "success" | "warning" | "neutral" | "info" | "error"> = {
  ok: "success",
  missing: "warning",
  not_applicable: "neutral",
  incomplete: "info",
  error: "error",
};

function num(source: Record<string, unknown>, key: string, fallback = 0): number {
  const value = source[key];
  return value === null || value === undefined ? fallback : Number(value);
}

function str(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function list<T>(source: Record<string, unknown>, key: string): T[] {
  const value = source[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function stateOf(component: MvpComponentRow): DataState {
  const raw = component.source_data["dataState"];
  if (raw === "ok" || raw === "missing" || raw === "not_applicable" || raw === "incomplete" || raw === "error") {
    return raw;
  }
  return component.is_applicable ? "ok" : "missing";
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}

function lateLabel(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || hours <= 0) return "Đúng hạn";
  if (hours < 24) return `Trễ ${Math.round(hours)} giờ`;
  return `Trễ ${Math.round((hours / 24) * 10) / 10} ngày`;
}

/* ================= khối trình bày dùng chung ================= */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border-subtle py-1 last:border-0">
      <span className="text-caption text-text-muted">{label}</span>
      <span className="min-w-0 break-words text-right text-caption font-medium text-text-primary">
        {value}
      </span>
    </div>
  );
}

/** Bảng đọc được trên mobile: mỗi dòng là một thẻ dọc, desktop giãn ngang. */
function ItemCard({
  title,
  badge,
  lines,
  warning,
}: {
  title: string;
  badge?: React.ReactNode;
  lines: { label: string; value: React.ReactNode }[];
  warning?: string | null;
}) {
  return (
    <li className="min-w-0 rounded-md border border-border-subtle bg-background-base p-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-words text-caption font-medium text-text-primary">{title}</span>
        {badge}
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap gap-x-4 gap-y-0.5">
        {lines.map((line) => (
          <span key={line.label} className="text-caption text-text-muted">
            {line.label}: <span className="text-text-secondary">{line.value}</span>
          </span>
        ))}
      </div>
      {warning ? <p className="mt-1 text-caption text-state-warning">⚠ {warning}</p> : null}
    </li>
  );
}

function Collapsible({
  count,
  labelOpen,
  labelClosed,
  children,
}: {
  count: number;
  labelOpen: string;
  labelClosed: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="mt-2 min-w-0">
      <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
        {open ? labelOpen : `${labelClosed} (${count})`}
      </Button>
      {open ? <ul className="mt-2 flex min-w-0 flex-col gap-2">{children}</ul> : null}
    </div>
  );
}

/* ================= chi tiết theo từng tiêu chí ================= */

interface TaskItem {
  task_id: string | null;
  title: string | null;
  weight: number;
  status: string;
  completed_at: string | null;
  deadline_snapshot: string | null;
  is_completed: boolean;
  on_time: boolean | null;
  late_hours: number | null;
  warning: string | null;
}

function CompletionDetail({ source }: { source: Record<string, unknown> }) {
  const items = list<TaskItem>(source, "items");
  return (
    <div className="min-w-0">
      <Row label="Số công việc được tính" value={num(source, "taskCount")} />
      <Row
        label="Đã hoàn thành"
        value={`${num(source, "completedTaskCount")}/${num(source, "taskCount")} công việc`}
      />
      <Row
        label="Trọng số hoàn thành"
        value={`${num(source, "completedWeight", num(source, "doneWeight"))}/${num(source, "totalWeight")}`}
      />
      <Row label="Tỷ lệ" value={percent(num(source, "ratio"))} />
      <Collapsible count={items.length} labelOpen="Ẩn danh sách công việc" labelClosed="Xem công việc đã tính">
        {items.map((item, index) => (
          <ItemCard
            key={item.task_id ?? `${index}`}
            title={item.title ?? "Công việc"}
            badge={
              <Badge variant={item.is_completed ? "success" : "neutral"} size="sm">
                {item.is_completed ? "Hoàn thành" : "Chưa hoàn thành"}
              </Badge>
            }
            lines={[
              {
                label: "Trọng số",
                value: MVP_TASK_WEIGHT_LABEL[item.weight as MvpTaskWeight] ?? item.weight,
              },
              { label: "Hạn (ảnh chụp)", value: formatHanoiDate(item.deadline_snapshot) },
              {
                label: "Hoàn thành",
                value: item.completed_at ? formatHanoiDateTime(item.completed_at) : "—",
              },
            ]}
            warning={item.warning}
          />
        ))}
      </Collapsible>
    </div>
  );
}

function OnTimeDetail({ source }: { source: Record<string, unknown> }) {
  const items = list<TaskItem>(source, "items");
  return (
    <div className="min-w-0">
      <Row
        label="Hoàn thành đúng hạn"
        value={`${num(source, "onTime")}/${num(source, "done")} công việc`}
      />
      <Row
        label="Trọng số đúng hạn"
        value={`${num(source, "onTimeWeight")}/${num(source, "completedWeight")} (trễ ${num(source, "lateWeight")})`}
      />
      <Row label="Tỷ lệ" value={percent(num(source, "ratio"))} />
      <Collapsible count={items.length} labelOpen="Ẩn danh sách công việc" labelClosed="Xem công việc đã hoàn thành">
        {items.map((item, index) => (
          <ItemCard
            key={item.task_id ?? `${index}`}
            title={item.title ?? "Công việc"}
            badge={
              <Badge variant={item.on_time ? "success" : "warning"} size="sm">
                {item.on_time ? "Đúng hạn" : lateLabel(item.late_hours)}
              </Badge>
            }
            lines={[
              {
                label: "Trọng số",
                value: MVP_TASK_WEIGHT_LABEL[item.weight as MvpTaskWeight] ?? item.weight,
              },
              { label: "Hạn (ảnh chụp)", value: formatHanoiDate(item.deadline_snapshot) },
              {
                label: "Hoàn thành",
                value: item.completed_at ? formatHanoiDateTime(item.completed_at) : "—",
              },
            ]}
            warning={item.warning}
          />
        ))}
      </Collapsible>
    </div>
  );
}

interface ObligationItem {
  kind: "daily" | "weekly";
  periodKey: string;
  dueAt: string | null;
  state: "completed" | "missing" | "exempt";
  exemptReason?: string | null;
  source: "obligation" | "derived" | "work_record";
  workDay?: { status: "working" | "day_off"; shift: string | null } | null;
}

const WORK_SHIFT_LABEL: Record<string, string> = {
  full_day: "Cả ngày",
  morning: "Ca sáng",
  afternoon: "Ca chiều",
  evening: "Ca tối",
  custom: "Ca khác",
};

const OBLIGATION_STATE_LABEL: Record<ObligationItem["state"], string> = {
  completed: "Đã hoàn thành",
  missing: "Thiếu",
  exempt: "Miễn",
};

function ReportingDetail({ source }: { source: Record<string, unknown> }) {
  const items = list<ObligationItem>(source, "items");
  const sources = list<string>(source, "sources");
  return (
    <div className="min-w-0">
      <Row label="Tổng nghĩa vụ tính điểm" value={num(source, "obligationCount")} />
      <Row label="Đã hoàn thành" value={num(source, "completed")} />
      <Row label="Thiếu" value={num(source, "missing")} />
      <Row label="Được miễn" value={num(source, "exempt")} />
      <Row label="Tỷ lệ" value={percent(num(source, "ratio"))} />
      <Row
        label="Nguồn nghĩa vụ"
        value={sources
          .map((item) =>
            item === "obligation"
              ? "Sổ nghĩa vụ báo cáo"
              : item === "work_record"
                ? "Ngày làm việc đã xác nhận"
                : "Suy từ lịch làm việc",
          )
          .join(" · ") || "—"}
      />
      <Collapsible count={items.length} labelOpen="Ẩn danh sách nghĩa vụ" labelClosed="Xem từng nghĩa vụ">
        {items.map((item) => (
          <ItemCard
            key={`${item.kind}-${item.periodKey}`}
            title={`${item.kind === "daily" ? "Báo cáo ngày" : "Báo cáo tuần"} · ${item.periodKey}`}
            badge={
              <Badge
                variant={
                  item.state === "completed" ? "success" : item.state === "exempt" ? "neutral" : "warning"
                }
                size="sm"
              >
                {OBLIGATION_STATE_LABEL[item.state]}
              </Badge>
            }
            lines={[
              { label: "Hạn", value: item.dueAt ? formatHanoiDateTime(item.dueAt) : "—" },
              ...(item.workDay
                ? [
                    {
                      label: "Nguồn ngày làm việc",
                      value:
                        item.workDay.status === "working"
                          ? `Ngày làm việc · ${WORK_SHIFT_LABEL[item.workDay.shift ?? ""] ?? "Cả ngày"}`
                          : "Nhân sự tự khai ngày nghỉ (không tự miễn nghĩa vụ)",
                    },
                  ]
                : []),
              ...(item.exemptReason ? [{ label: "Lý do miễn", value: item.exemptReason }] : []),
            ]}
          />
        ))}
      </Collapsible>
    </div>
  );
}

function AnnouncementDetail({ source }: { source: Record<string, unknown> }) {
  const items = list<MvpAnnouncementEvaluation>(source, "items");
  return (
    <div className="min-w-0">
      <Row label="Thông báo được tính" value={num(source, "counted")} />
      <Row label="Không tính" value={num(source, "excluded")} />
      <Row
        label="Kết quả xác nhận"
        value={`Đúng hạn ${num(source, "onTime")} · ≤12h ${num(source, "late12")} · ≤24h ${num(source, "late24")} · ≤48h ${num(source, "late48")} · quá 48h ${num(source, "missed")}`}
      />
      <Row label="Tổng hệ số" value={num(source, "coefficientSum")} />
      <Collapsible count={items.length} labelOpen="Ẩn danh sách thông báo" labelClosed="Xem từng thông báo">
        {items.map((item) => (
          <ItemCard
            key={`${item.announcementId}-${item.dueAt ?? ""}`}
            title={item.title || "Thông báo"}
            badge={
              <Badge variant={item.excluded ? "neutral" : "info"} size="sm">
                {item.excluded
                  ? MVP_ANNOUNCEMENT_BUCKET_LABEL.excluded
                  : `${MVP_ANNOUNCEMENT_BUCKET_LABEL[item.bucket as MvpAnnouncementBucket]} · hệ số ${item.coefficient}`}
              </Badge>
            }
            lines={[
              {
                label: "Hạn chấm",
                value: formatHanoiDateTime(item.gradingDueAt ?? item.dueAt),
              },
              {
                label: "Xác nhận",
                value: item.acknowledgedAt ? formatHanoiDateTime(item.acknowledgedAt) : "Chưa xác nhận",
              },
              ...(item.lateHours && item.lateHours > 0
                ? [{ label: "Mức trễ", value: lateLabel(item.lateHours) }]
                : []),
              ...(item.dueChangedAfterOverdue
                ? [{ label: "Ghi chú", value: "Hạn được dời sau khi đã quá hạn — chấm theo hạn cũ" }]
                : []),
            ]}
            warning={item.excluded ? `Không tính: ${item.excludeReason}` : null}
          />
        ))}
      </Collapsible>
    </div>
  );
}

function VoteDetail({ source }: { source: Record<string, unknown> }) {
  return (
    <div className="min-w-0">
      <Row label="Số phiếu nhận được" value={num(source, "votesReceived")} />
      <Row label="Số phiếu cao nhất kỳ (chuẩn hóa)" value={num(source, "topVotes")} />
      <Row label="Tỷ lệ" value={percent(num(source, "ratio"))} />
      <p className="mt-1 text-caption text-text-muted">
        Phiếu bầu là ẩn danh: hệ thống chỉ hiển thị số phiếu, không hiển thị ai đã bầu cho ai.
      </p>
    </div>
  );
}

function ReviewDetail({ source }: { source: Record<string, unknown> }) {
  if (!source["hasReview"]) {
    return <p className="text-caption text-text-muted">Chưa có đánh giá của người quản lý trực tiếp.</p>;
  }
  return (
    <div className="min-w-0">
      <Row label="Người đánh giá" value={str(source, "reviewerName") ?? "—"} />
      <Row
        label="Thời điểm gửi"
        value={str(source, "submittedAt") ? formatHanoiDateTime(str(source, "submittedAt")) : "—"}
      />
      {str(source, "reason") ? <Row label="Lý do" value={str(source, "reason")} /> : null}
      {str(source, "evidence") ? <Row label="Bằng chứng" value={str(source, "evidence")} /> : null}
    </div>
  );
}

function CriterionCard({ component }: { component: MvpComponentRow }) {
  const [open, setOpen] = useState(false);
  const state = stateOf(component);
  const source = component.source_data;
  const criterion = component.criterion as MvpCriterion;

  return (
    <div className="min-w-0 rounded-md border border-border-default bg-background-elevated p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0 break-words text-label font-medium text-text-primary">
          {MVP_CRITERION_LABEL[criterion] ?? criterion} — {component.earned_points}/
          {component.max_points}
        </span>
        <span className="flex items-center gap-2">
          <Badge variant={DATA_STATE_VARIANT[state]} size="sm">
            {DATA_STATE_LABEL[state]}
          </Badge>
          <span className="text-caption text-text-muted">{open ? "Thu gọn" : "Chi tiết"}</span>
        </span>
      </button>
      <p className="mt-1 break-words text-helper text-text-muted">{component.formula ?? "—"}</p>
      {!component.is_applicable && component.not_applicable_reason ? (
        <p className="mt-1 break-words text-caption text-state-warning">
          {component.not_applicable_reason}
        </p>
      ) : null}
      {open ? (
        <div className="mt-2 min-w-0 border-t border-border-subtle pt-2">
          {criterion === "completion" ? <CompletionDetail source={source} /> : null}
          {criterion === "on_time" ? <OnTimeDetail source={source} /> : null}
          {criterion === "reporting" ? <ReportingDetail source={source} /> : null}
          {criterion === "announcement" ? <AnnouncementDetail source={source} /> : null}
          {criterion === "vote" ? <VoteDetail source={source} /> : null}
          {["quality", "proactive", "impact", "teamwork"].includes(criterion) ? (
            <ReviewDetail source={source} />
          ) : null}
          {Object.keys(source).length === 0 ? (
            <p className="text-caption text-state-warning">
              ⚠ Thành phần điểm này chưa có dữ liệu nguồn — hãy tính lại điểm.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GroupHeader({ title, score, max }: { title: string; score: number; max: number | null }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <span className="text-label font-semibold text-text-primary">{title}</span>
      <span className="text-label font-semibold text-text-primary">
        {Math.round(score * 10) / 10}
        {max === null ? "" : ` / ${max}`}
      </span>
    </div>
  );
}

/* ================= Modal chính ================= */

export function ScorecardDetail(props: ScorecardDetailProps) {
  const { open, onOpenChange, cycleId, userId, userName, totalScore } = props;

  const components = useQuery({
    ...mvpComponentsQuery(cycleId, userId),
    enabled: open && Boolean(userId),
  });
  const bonus = useQuery({ ...mvpBonusQuery(cycleId), enabled: open && Boolean(userId) });

  const rows = components.data ?? [];
  const byCriterion = new Map(rows.map((row) => [row.criterion as MvpCriterion, row]));
  const sumOf = (criteria: MvpCriterion[]) =>
    criteria.reduce((sum, key) => sum + (byCriterion.get(key)?.earned_points ?? 0), 0);
  const maxOf = (criteria: MvpCriterion[]) =>
    criteria.reduce((sum, key) => sum + (byCriterion.get(key)?.max_points ?? MVP_CRITERION_MAX[key]), 0);

  const cenCriteria: MvpCriterion[] = ["completion", "on_time", "reporting", "announcement"];
  const reviewCriteria: MvpCriterion[] = ["quality", "proactive", "impact", "teamwork"];
  const myBonus = (bonus.data ?? []).filter((row) => row.subject_id === userId);
  const approvedBonus = myBonus.filter((row) => row.status === "approved");
  const penalty = Number(byCriterion.get("on_time")?.source_data["penaltyPoints"] ?? props.penaltyScore ?? 0);
  const penaltyItems = list<Record<string, unknown>>(
    byCriterion.get("on_time")?.source_data ?? {},
    "penaltyItems",
  );
  const missing = rows.filter((row) => stateOf(row) === "missing");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Chi tiết điểm — ${userName}`}
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{props.teamName ?? "Chưa có Team"}</span>
          {props.cycleLabel ? <span>Kỳ {props.cycleLabel}</span> : null}
          <span className="font-medium text-text-primary">
            {totalScore} / {MVP_TOTAL_MAX}
          </span>
          <Badge variant={props.isEligible === false ? "warning" : "success"} size="sm">
            {props.isEligible === false ? "Chưa đủ điều kiện" : "Đủ điều kiện"}
          </Badge>
        </span>
      }
      size="xl"
    >
      <div className="flex min-w-0 flex-col gap-3">
        {props.isLocked ? (
          <p className="rounded-md border border-border-subtle bg-background-base p-2 text-caption text-text-muted">
            Dữ liệu dưới đây là dữ liệu tại thời điểm kỳ được chốt.
          </p>
        ) : null}

        {components.isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : components.isError ? (
          <ErrorState
            description="Không tải được chi tiết điểm."
            onRetry={() => void components.refetch()}
          />
        ) : rows.length === 0 ? (
          <p className="text-body text-text-muted">Kỳ này chưa được tính điểm.</p>
        ) : (
          <>
            {/* Tóm tắt các nhóm điểm */}
            <div className="min-w-0 rounded-md border border-border-default bg-background-elevated p-3">
              <GroupHeader
                title="CEN Data"
                score={sumOf(cenCriteria) + sumOf(["vote"])}
                max={MVP_AUTO_MAX}
              />
              <div className="mt-1">
                <Row
                  label="Khối lượng hoàn thành"
                  value={`${sumOf(["completion"])} / ${maxOf(["completion"])}`}
                />
                <Row label="Đúng hạn" value={`${sumOf(["on_time"])} / ${maxOf(["on_time"])}`} />
                <Row
                  label="Kỷ luật báo cáo"
                  value={`${sumOf(["reporting"])} / ${maxOf(["reporting"])}`}
                />
                <Row
                  label="Xác nhận thông báo"
                  value={`${sumOf(["announcement"])} / ${maxOf(["announcement"])}`}
                />
                <Row label="Đồng đội (phiếu bầu)" value={`${sumOf(["vote"])} / ${maxOf(["vote"])}`} />
                <Row
                  label="Leader/CMO Review"
                  value={`${Math.round(sumOf(reviewCriteria) * 10) / 10} / ${MVP_REVIEW_MAX}`}
                />
                <Row
                  label="Bonus đóng góp đặc biệt"
                  value={`+${approvedBonus.reduce((sum, row) => sum + row.points, 0)} / ${MVP_BONUS_MAX}`}
                />
                <Row label="Phạt quá hạn" value={penalty > 0 ? `-${penalty}` : "0"} />
                <Row
                  label="Tổng"
                  value={
                    <span className="text-text-primary">
                      {totalScore} / {MVP_TOTAL_MAX}
                    </span>
                  }
                />
                {props.dataCompleteness !== undefined ? (
                  <Row label="Độ đầy đủ dữ liệu" value={`${props.dataCompleteness}%`} />
                ) : null}
              </div>
              {props.ineligibleReason ? (
                <p className="mt-2 text-caption text-state-warning">{props.ineligibleReason}</p>
              ) : null}
              {missing.length > 0 ? (
                <p className="mt-1 text-caption text-state-warning">
                  Đang thiếu dữ liệu:{" "}
                  {missing
                    .map((row) => MVP_CRITERION_LABEL[row.criterion as MvpCriterion] ?? row.criterion)
                    .join(" · ")}
                </p>
              ) : null}
            </div>

            {/* Chi tiết từng tiêu chí */}
            {rows.map((component) => (
              <CriterionCard key={component.id} component={component} />
            ))}

            {/* Phạt quá hạn */}
            {penalty > 0 ? (
              <div className="min-w-0 rounded-md border border-border-default bg-background-elevated p-3">
                <GroupHeader title="Phạt quá hạn" score={-penalty} max={null} />
                <ul className="mt-2 flex min-w-0 flex-col gap-2">
                  {penaltyItems.map((item, index) => (
                    <ItemCard
                      key={String(item["task_id"] ?? index)}
                      title={(item["title"] as string) ?? "Công việc"}
                      badge={
                        <Badge variant="warning" size="sm">
                          -{Number(item["penalty"] ?? 0)}
                        </Badge>
                      }
                      lines={[
                        { label: "Hạn", value: formatHanoiDate(item["deadline_snapshot"] as string) },
                        { label: "Lý do", value: (item["reason"] as string) ?? "Quá hạn" },
                      ]}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Bonus */}
            {myBonus.length > 0 ? (
              <div className="min-w-0 rounded-md border border-border-default bg-background-elevated p-3">
                <GroupHeader
                  title="Bonus đóng góp đặc biệt"
                  score={approvedBonus.reduce((sum, row) => sum + row.points, 0)}
                  max={MVP_BONUS_MAX}
                />
                <ul className="mt-2 flex min-w-0 flex-col gap-2">
                  {myBonus.map((row) => (
                    <ItemCard
                      key={row.id}
                      title={row.reason || "Đóng góp đặc biệt"}
                      badge={
                        <Badge
                          variant={
                            row.status === "approved"
                              ? "success"
                              : row.status === "rejected"
                                ? "neutral"
                                : "warning"
                          }
                          size="sm"
                        >
                          {MVP_BONUS_STATUS_LABEL[row.status as MvpBonusStatus]} · +{row.points}
                        </Badge>
                      }
                      lines={[
                        { label: "Người đề xuất", value: row.proposerName ?? "—" },
                        ...(row.evidence ? [{ label: "Bằng chứng", value: row.evidence }] : []),
                        ...(row.decided_at
                          ? [{ label: "Quyết định", value: formatHanoiDateTime(row.decided_at) }]
                          : []),
                      ]}
                      warning={
                        row.status !== "approved" ? "Chưa được duyệt nên không cộng vào tổng điểm" : null
                      }
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
