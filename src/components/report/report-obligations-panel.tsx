import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDateTime } from "@/lib/datetime";
import { PERMISSIONS } from "@/lib/permissions";
import {
  OBLIGATION_STATE_LABEL,
  OBLIGATION_STATE_TONE,
  REPORT_KIND_LABEL,
  REPORT_PERIOD_STATUS_LABEL,
  REPORT_PERIOD_STATUS_TONE,
  decideExemption,
  exemptionRequestsQuery,
  generateDailyPeriods,
  generateWeeklyPeriods,
  obligationState,
  reportObligationsQuery,
  reportPeriodsQuery,
  requestExemption,
  type ReportObligationRow,
  type ReportPeriodRow,
} from "@/lib/report-obligation-data";
import { ensureReportForObligation } from "@/lib/report-workflow-data";

/**
 * CEN 1.0 — REPORT-01: kỳ báo cáo và nghĩa vụ.
 * Chỉ hiển thị dữ liệu RLS cho phép; mọi thao tác đều chốt lại ở database.
 */
const ALL = "__all__";

export function ReportObligationsPanel() {
  const access = useOrgAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canConfig = access.can(PERMISSIONS.REPORTS_CONFIG);
  const canGenerate = canConfig || access.isLeader;

  const periods = useQuery(reportPeriodsQuery());
  const obligations = useQuery(reportObligationsQuery());
  const exemptions = useQuery(exemptionRequestsQuery());

  const [kindFilter, setKindFilter] = React.useState(ALL);
  const [periodFilter, setPeriodFilter] = React.useState(ALL);
  const [stateFilter, setStateFilter] = React.useState(ALL);
  const [target, setTarget] = React.useState<ReportObligationRow | null>(null);
  const [reason, setReason] = React.useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["report-periods"] });
    void queryClient.invalidateQueries({ queryKey: ["report-obligations"] });
    void queryClient.invalidateQueries({ queryKey: ["report-exemptions"] });
  };

  const openDoc = useMutation({
    mutationFn: (obligationId: string) => ensureReportForObligation(obligationId),
    onSuccess: (reportId) => {
      invalidate();
      void navigate({ to: "/reports/doc/$reportId", params: { reportId } });
    },
    onError: (error: Error) => cenToast.error("Không mở được báo cáo", { description: error.message }),
  });

  const generate = useMutation({
    mutationFn: async (kind: "daily" | "weekly") => {
      const result =
        kind === "daily" ? await generateDailyPeriods(null) : await generateWeeklyPeriods(null);
      return result as { periods_created: number; obligations_created: number };
    },
    onSuccess: (result) => {
      invalidate();
      cenToast.success("Đã chạy tạo kỳ", {
        description: `Kỳ mới: ${result.periods_created} — nghĩa vụ mới: ${result.obligations_created}`,
      });
    },
    onError: (error: Error) => cenToast.error("Không tạo được kỳ", { description: error.message }),
  });

  const askExemption = useMutation({
    mutationFn: () =>
      requestExemption({
        obligationId: target!.id,
        requestedBy: access.userId!,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      invalidate();
      setTarget(null);
      setReason("");
      cenToast.success("Đã gửi đề nghị miễn nghĩa vụ");
    },
    onError: (error: Error) => cenToast.error("Không gửi được", { description: error.message }),
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; approve: boolean }) =>
      decideExemption(input.id, input.approve, null),
    onSuccess: () => {
      invalidate();
      cenToast.success("Đã xử lý đề nghị");
    },
    onError: (error: Error) => cenToast.error("Không xử lý được", { description: error.message }),
  });

  const rows = React.useMemo(() => {
    const now = Date.now();
    return (obligations.data ?? []).filter((row) => {
      if (kindFilter !== ALL && row.report_type !== kindFilter) return false;
      if (periodFilter !== ALL && row.period_id !== periodFilter) return false;
      if (stateFilter !== ALL && obligationState(row, now) !== stateFilter) return false;
      return true;
    });
  }, [obligations.data, kindFilter, periodFilter, stateFilter]);

  const periodColumns = [
    {
      id: "period",
      header: "Kỳ",
      className: "min-w-[180px]",
      cell: (row: ReportPeriodRow) => (
        <TableCellStack
          primary={`${REPORT_KIND_LABEL[row.report_type]} · ${row.period_key}`}
          secondary={row.teamName ?? "Toàn bộ Team"}
        />
      ),
    },
    {
      id: "open",
      header: "Mở kỳ",
      className: "min-w-[150px]",
      cell: (row: ReportPeriodRow) => (
        <span className="text-text-secondary">{formatHanoiDateTime(row.opens_at)}</span>
      ),
    },
    {
      id: "due",
      header: "Hạn gửi",
      className: "min-w-[150px]",
      cell: (row: ReportPeriodRow) => (
        <span className="text-text-secondary">{formatHanoiDateTime(row.due_at)}</span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[120px]",
      cell: (row: ReportPeriodRow) => (
        <StatusBadge
          label={REPORT_PERIOD_STATUS_LABEL[row.status]}
          tone={REPORT_PERIOD_STATUS_TONE[row.status]}
        />
      ),
    },
  ];

  const obligationColumns = [
    {
      id: "person",
      header: "Người phải gửi",
      className: "min-w-[180px]",
      cell: (row: ReportObligationRow) => (
        <TableCellStack primary={row.userName ?? "—"} secondary={row.teamName ?? "—"} />
      ),
    },
    {
      id: "kind",
      header: "Loại và kỳ",
      className: "min-w-[160px]",
      cell: (row: ReportObligationRow) => (
        <TableCellStack
          primary={REPORT_KIND_LABEL[row.report_type]}
          secondary={row.period_key}
        />
      ),
    },
    {
      id: "reviewer",
      header: "Người kiểm tra",
      className: "min-w-[150px]",
      cell: (row: ReportObligationRow) => (
        <span className="text-text-secondary">{row.reviewerName ?? "Chưa xác định"}</span>
      ),
    },
    {
      id: "due",
      header: "Hạn gửi",
      className: "min-w-[150px]",
      cell: (row: ReportObligationRow) => (
        <span className="text-text-secondary">{formatHanoiDateTime(row.due_at)}</span>
      ),
    },
    {
      id: "state",
      header: "Nghĩa vụ",
      className: "min-w-[130px]",
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
    {
      id: "actions",
      header: "",
      className: "min-w-[200px]",
      cell: (row: ReportObligationRow) => (
        <div className="flex flex-wrap gap-1">
          {row.user_id === access.userId && !row.is_exempt ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={openDoc.isPending}
              onClick={() => openDoc.mutate(row.id)}
            >
              {row.first_submitted_at ? "Mở báo cáo" : "Soạn báo cáo"}
            </Button>
          ) : null}
          {row.is_exempt || row.first_submitted_at ? null : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTarget(row);
              setReason("");
            }}
          >
            Đề nghị miễn
          </Button>
          )}
        </div>
      ),
    },
  ];

  const pending = (exemptions.data ?? []).filter((row) => row.status === "pending");

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <SectionHeader
        title="Kỳ báo cáo"
        description="Kỳ được tạo theo quy tắc đang hiệu lực. Chạy lại nhiều lần không sinh dữ liệu trùng."
        actions={
          canGenerate ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={generate.isPending && generate.variables === "daily"}
                onClick={() => generate.mutate("daily")}
              >
                <CalendarClock />
                Tạo kỳ ngày hôm nay
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={generate.isPending && generate.variables === "weekly"}
                onClick={() => generate.mutate("weekly")}
              >
                <RefreshCw />
                Tạo kỳ tuần này
              </Button>
            </div>
          ) : null
        }
      />
      <DataTable
        columns={periodColumns}
        data={periods.data ?? []}
        getRowId={(row) => row.id}
        density="compact"
        loading={periods.isLoading}
        error={periods.isError}
        onRetry={() => void periods.refetch()}
        errorTitle="Không tải được kỳ báo cáo"
        emptyTitle="Chưa có kỳ báo cáo nào"
        emptyDescription="Tạo quy tắc báo cáo rồi chạy tạo kỳ để bắt đầu."
      />

      <SectionHeader
        title="Nghĩa vụ theo kỳ"
        description="Nguồn chính thức để biết ai phải gửi, hạn nào và ai kiểm tra."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger aria-label="Lọc theo loại báo cáo">
            <SelectValue placeholder="Loại báo cáo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả loại</SelectItem>
            <SelectItem value="daily">Báo cáo ngày</SelectItem>
            <SelectItem value="weekly">Báo cáo tuần</SelectItem>
            <SelectItem value="project">Báo cáo dự án</SelectItem>
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger aria-label="Lọc theo kỳ">
            <SelectValue placeholder="Kỳ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả kỳ</SelectItem>
            {(periods.data ?? []).map((period) => (
              <SelectItem key={period.id} value={period.id}>
                {REPORT_KIND_LABEL[period.report_type]} · {period.period_key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger aria-label="Lọc theo trạng thái nghĩa vụ">
            <SelectValue placeholder="Trạng thái nghĩa vụ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {Object.entries(OBLIGATION_STATE_LABEL).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={obligationColumns}
        data={rows}
        getRowId={(row) => row.id}
        density="compact"
        loading={obligations.isLoading}
        error={obligations.isError}
        onRetry={() => void obligations.refetch()}
        errorTitle="Không tải được nghĩa vụ báo cáo"
        emptyTitle="Chưa có nghĩa vụ nào trong phạm vi của bạn"
        emptyDescription="Nghĩa vụ xuất hiện sau khi kỳ báo cáo được tạo."
      />

      <SectionHeader
        title="Đề nghị miễn nghĩa vụ"
        description="Leader xử lý trong Team, CMO xử lý toàn bộ. Mọi quyết định đều được ghi nhật ký."
      />
      {pending.length === 0 ? (
        <EmptyState
          variant="compact"
          title="Không có đề nghị chờ xử lý"
          description="Đề nghị miễn nghĩa vụ sẽ hiển thị tại đây."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {pending.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-control border border-border-default p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-body text-text-primary">{row.reason}</p>
                <p className="text-caption text-text-muted">
                  {row.requesterName ?? "—"} · {formatHanoiDateTime(row.created_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => decide.mutate({ id: row.id, approve: true })}
                  loading={decide.isPending}
                >
                  Duyệt miễn
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => decide.mutate({ id: row.id, approve: false })}
                  loading={decide.isPending}
                >
                  Từ chối
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(target)}
        onOpenChange={(open) => (open ? null : setTarget(null))}
        title="Đề nghị miễn nghĩa vụ"
        description="Nêu rõ lý do. Đề nghị phải được Leader hoặc CMO phê duyệt."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Huỷ
            </Button>
            <Button
              onClick={() => askExemption.mutate()}
              disabled={!reason.trim() || !access.userId}
              loading={askExemption.isPending}
            >
              Gửi đề nghị
            </Button>
          </div>
        }
      >
        <FormField id="exemption-reason" label="Lý do">
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ví dụ: nghỉ phép đã duyệt, ngày nghỉ hợp lệ."
            />
          )}
        </FormField>
      </Modal>

    </div>
  );
}
