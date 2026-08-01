import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
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
import { Switch } from "@/components/ui/switch";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDate, formatHanoiDateTime } from "@/lib/datetime";
import { membersQuery, teamsQuery } from "@/lib/org-data";
import { PERMISSIONS } from "@/lib/permissions";
import {
  REPORT_KIND_LABEL,
  createNonWorkingDay,
  createRequirement,
  createReviewerAssignment,
  nonWorkingDaysQuery,
  reportRequirementsQuery,
  reviewerAssignmentsQuery,
  setReviewerAssignmentActive,
  updateRequirement,
  type NonWorkingDayRow,
  type ReportKind,
  type ReportRequirementRow,
  type ReviewerAssignmentRow,
} from "@/lib/report-obligation-data";

/**
 * CEN 1.0 — REPORT-01: màn hình cấu hình tối thiểu.
 * CMO cấu hình toàn bộ; Leader chỉ đổi xác nhận/bằng chứng của báo cáo ngày trong Team mình.
 * UI chỉ ẩn/disable; RLS và trigger database mới là ràng buộc thật.
 */
const NONE = "__none__";

export function ReportConfigPanel() {
  const access = useOrgAccess();
  const queryClient = useQueryClient();
  const canConfig = access.can(PERMISSIONS.REPORTS_CONFIG);

  const requirements = useQuery(reportRequirementsQuery());
  const assignments = useQuery(reviewerAssignmentsQuery());
  const nonWorking = useQuery(nonWorkingDaysQuery());
  const teams = useQuery(teamsQuery());
  const members = useQuery(membersQuery());

  const [requirementOpen, setRequirementOpen] = React.useState(false);
  const [delegateOpen, setDelegateOpen] = React.useState(false);
  const [dayOpen, setDayOpen] = React.useState(false);

  const [reportType, setReportType] = React.useState<ReportKind>("daily");
  const [teamId, setTeamId] = React.useState(NONE);
  const [dueTime, setDueTime] = React.useState("23:59");
  const [requiresAck, setRequiresAck] = React.useState(true);
  const [requiresEvidence, setRequiresEvidence] = React.useState(false);
  const [effectiveFrom, setEffectiveFrom] = React.useState(
    new Date().toISOString().slice(0, 10),
  );

  const [principalId, setPrincipalId] = React.useState(NONE);
  const [delegateId, setDelegateId] = React.useState(NONE);
  const [delegateStart, setDelegateStart] = React.useState("");
  const [delegateEnd, setDelegateEnd] = React.useState("");

  const [dayValue, setDayValue] = React.useState("");
  const [dayTeam, setDayTeam] = React.useState(NONE);
  const [dayUser, setDayUser] = React.useState(NONE);
  const [dayReason, setDayReason] = React.useState("");

  const invalidate = (key: string) => void queryClient.invalidateQueries({ queryKey: [key] });

  const saveRequirement = useMutation({
    mutationFn: () =>
      createRequirement({
        reportType,
        teamId: teamId === NONE ? null : teamId,
        appliesAllTeams: teamId === NONE,
        cadence: reportType === "weekly" ? "weekly" : "daily",
        openDayOfWeek: reportType === "weekly" ? 5 : null,
        openTime: "00:00",
        dueDayOfWeek: reportType === "weekly" ? 7 : null,
        dueTime,
        requiresAck: reportType === "weekly" ? true : requiresAck,
        requiresEvidence,
        defaultReviewerId: null,
        effectiveFrom,
        effectiveTo: null,
        isActive: true,
      }),
    onSuccess: () => {
      invalidate("report-requirements");
      setRequirementOpen(false);
      cenToast.success("Đã tạo quy tắc báo cáo");
    },
    onError: (error: Error) => cenToast.error("Không tạo được", { description: error.message }),
  });

  const toggleFlag = useMutation({
    mutationFn: (input: { id: string; field: "requiresAck" | "requiresEvidence"; value: boolean }) =>
      updateRequirement(input.id, { [input.field]: input.value }),
    onSuccess: () => {
      invalidate("report-requirements");
      cenToast.success("Đã cập nhật quy tắc");
    },
    onError: (error: Error) =>
      cenToast.error("Không cập nhật được", { description: error.message }),
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; value: boolean }) =>
      updateRequirement(input.id, { isActive: input.value }),
    onSuccess: () => {
      invalidate("report-requirements");
      cenToast.success("Đã cập nhật trạng thái quy tắc");
    },
    onError: (error: Error) =>
      cenToast.error("Không cập nhật được", { description: error.message }),
  });

  const saveDelegate = useMutation({
    mutationFn: () =>
      createReviewerAssignment({
        principalId,
        delegateId,
        teamId: null,
        reportType: null,
        startsAt: delegateStart ? new Date(delegateStart).toISOString() : new Date().toISOString(),
        endsAt: delegateEnd ? new Date(delegateEnd).toISOString() : null,
      }),
    onSuccess: () => {
      invalidate("report-reviewer-assignments");
      setDelegateOpen(false);
      cenToast.success("Đã cấu hình người kiểm tra thay thế");
    },
    onError: (error: Error) => cenToast.error("Không lưu được", { description: error.message }),
  });

  const stopDelegate = useMutation({
    mutationFn: (id: string) => setReviewerAssignmentActive(id, false),
    onSuccess: () => {
      invalidate("report-reviewer-assignments");
      cenToast.success("Đã ngừng uỷ quyền");
    },
    onError: (error: Error) => cenToast.error("Không lưu được", { description: error.message }),
  });

  const saveDay = useMutation({
    mutationFn: () =>
      createNonWorkingDay({
        day: dayValue,
        teamId: dayTeam === NONE ? null : dayTeam,
        userId: dayUser === NONE ? null : dayUser,
        reason: dayReason.trim(),
      }),
    onSuccess: () => {
      invalidate("report-non-working-days");
      setDayOpen(false);
      cenToast.success("Đã thêm ngày không làm việc");
    },
    onError: (error: Error) => cenToast.error("Không lưu được", { description: error.message }),
  });

  if (!canConfig && !access.isLeader) {
    return (
      <EmptyState
        title="Bạn không có quyền xem cấu hình báo cáo"
        description="Chỉ CMO cấu hình quy tắc; Leader xem và chỉnh tuỳ chọn trong Team mình."
      />
    );
  }

  const requirementColumns = [
    {
      id: "type",
      header: "Quy tắc",
      className: "min-w-[190px]",
      cell: (row: ReportRequirementRow) => (
        <TableCellStack
          primary={REPORT_KIND_LABEL[row.report_type]}
          secondary={
            row.applies_all_teams ? "Toàn bộ Team" : (row.teamName ?? row.projectName ?? "—")
          }
        />
      ),
    },
    {
      id: "schedule",
      header: "Chu kỳ và hạn",
      className: "min-w-[170px]",
      cell: (row: ReportRequirementRow) => (
        <TableCellStack
          primary={row.cadence === "weekly" ? "Hằng tuần" : "Hằng ngày"}
          secondary={`Hạn ${row.due_time.slice(0, 5)}`}
        />
      ),
    },
    {
      id: "ack",
      header: "Cần xác nhận",
      className: "min-w-[120px]",
      cell: (row: ReportRequirementRow) => (
        <Switch
          checked={row.requires_ack}
          disabled={row.report_type === "weekly" || toggleFlag.isPending}
          aria-label="Cần xác nhận"
          onCheckedChange={(value) =>
            toggleFlag.mutate({ id: row.id, field: "requiresAck", value })
          }
        />
      ),
    },
    {
      id: "evidence",
      header: "Yêu cầu bằng chứng",
      className: "min-w-[140px]",
      cell: (row: ReportRequirementRow) => (
        <Switch
          checked={row.requires_evidence}
          disabled={toggleFlag.isPending}
          aria-label="Yêu cầu bằng chứng"
          onCheckedChange={(value) =>
            toggleFlag.mutate({ id: row.id, field: "requiresEvidence", value })
          }
        />
      ),
    },
    {
      id: "reviewer",
      header: "Người kiểm tra mặc định",
      className: "min-w-[160px]",
      cell: (row: ReportRequirementRow) => (
        <span className="text-text-secondary">{row.reviewerName ?? "Theo vai trò"}</span>
      ),
    },
    {
      id: "effective",
      header: "Hiệu lực",
      className: "min-w-[150px]",
      cell: (row: ReportRequirementRow) => (
        <TableCellStack
          primary={formatHanoiDate(row.effective_from)}
          secondary={row.effective_to ? formatHanoiDate(row.effective_to) : "Không giới hạn"}
        />
      ),
    },
    {
      id: "active",
      header: "Kích hoạt",
      className: "min-w-[110px]",
      cell: (row: ReportRequirementRow) =>
        canConfig ? (
          <Switch
            checked={row.is_active}
            disabled={toggleActive.isPending}
            aria-label="Kích hoạt quy tắc"
            onCheckedChange={(value) => toggleActive.mutate({ id: row.id, value })}
          />
        ) : (
          <StatusBadge
            label={row.is_active ? "Đang áp dụng" : "Tạm dừng"}
            tone={row.is_active ? "success" : "neutral"}
          />
        ),
    },
  ];

  const assignmentColumns = [
    {
      id: "principal",
      header: "Người được thay thế",
      className: "min-w-[170px]",
      cell: (row: ReviewerAssignmentRow) => (
        <TableCellStack
          primary={row.principalName ?? "—"}
          secondary={row.teamName ?? "Mọi Team"}
        />
      ),
    },
    {
      id: "delegate",
      header: "Người thay thế",
      className: "min-w-[150px]",
      cell: (row: ReviewerAssignmentRow) => (
        <span className="text-text-secondary">{row.delegateName ?? "—"}</span>
      ),
    },
    {
      id: "range",
      header: "Hiệu lực",
      className: "min-w-[190px]",
      cell: (row: ReviewerAssignmentRow) => (
        <TableCellStack
          primary={formatHanoiDateTime(row.starts_at)}
          secondary={row.ends_at ? formatHanoiDateTime(row.ends_at) : "Không thời hạn"}
        />
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[140px]",
      cell: (row: ReviewerAssignmentRow) => (
        <StatusBadge
          label={row.is_active ? "Còn hiệu lực" : "Đã ngừng"}
          tone={row.is_active ? "success" : "neutral"}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      className: "min-w-[110px]",
      cell: (row: ReviewerAssignmentRow) =>
        canConfig && row.is_active ? (
          <Button variant="ghost" size="sm" onClick={() => stopDelegate.mutate(row.id)}>
            Ngừng
          </Button>
        ) : null,
    },
  ];

  const dayColumns = [
    {
      id: "day",
      header: "Ngày",
      className: "min-w-[130px]",
      cell: (row: NonWorkingDayRow) => (
        <span className="text-text-secondary">{formatHanoiDate(row.day)}</span>
      ),
    },
    {
      id: "scope",
      header: "Phạm vi",
      className: "min-w-[170px]",
      cell: (row: NonWorkingDayRow) => (
        <span className="text-text-secondary">
          {row.userName ?? row.teamName ?? "Toàn bộ tổ chức"}
        </span>
      ),
    },
    {
      id: "reason",
      header: "Lý do",
      className: "min-w-[200px]",
      cell: (row: NonWorkingDayRow) => (
        <span className="line-clamp-2 text-text-secondary">{row.reason}</span>
      ),
    },
  ];

  const memberOptions = members.data ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <SectionHeader
        title="Quy tắc báo cáo"
        description="Thay đổi chỉ áp dụng cho kỳ chưa tạo; kỳ đã phát sinh giữ nguyên bản chụp cấu hình."
        actions={
          canConfig ? (
            <Button size="sm" onClick={() => setRequirementOpen(true)}>
              <Plus />
              Thêm quy tắc
            </Button>
          ) : null
        }
      />
      <DataTable
        columns={requirementColumns}
        data={requirements.data ?? []}
        getRowId={(row) => row.id}
        density="compact"
        loading={requirements.isLoading}
        error={requirements.isError}
        onRetry={() => void requirements.refetch()}
        errorTitle="Không tải được quy tắc báo cáo"
        emptyTitle="Chưa có quy tắc báo cáo"
        emptyDescription="CMO tạo quy tắc báo cáo ngày và tuần để hệ thống sinh kỳ và nghĩa vụ."
      />

      <SectionHeader
        title="Người kiểm tra thay thế"
        description="Thứ tự xác định: người thay thế còn hiệu lực → người kiểm tra mặc định → CMO."
        actions={
          canConfig ? (
            <Button size="sm" variant="secondary" onClick={() => setDelegateOpen(true)}>
              <Plus />
              Thêm uỷ quyền
            </Button>
          ) : null
        }
      />
      <DataTable
        columns={assignmentColumns}
        data={assignments.data ?? []}
        getRowId={(row) => row.id}
        density="compact"
        loading={assignments.isLoading}
        error={assignments.isError}
        onRetry={() => void assignments.refetch()}
        errorTitle="Không tải được uỷ quyền kiểm tra"
        emptyTitle="Chưa có uỷ quyền nào"
        emptyDescription="Khi không có uỷ quyền, hệ thống dùng người kiểm tra mặc định."
      />

      <SectionHeader
        title="Ngày không làm việc"
        description="Nguồn lịch nghỉ tối thiểu: ngày nghỉ chung, nghỉ theo Team hoặc nghỉ phép đã duyệt của một người. Không phát sinh nghĩa vụ trong những ngày này."
        actions={
          canConfig || access.isLeader ? (
            <Button size="sm" variant="secondary" onClick={() => setDayOpen(true)}>
              <Plus />
              Thêm ngày nghỉ
            </Button>
          ) : null
        }
      />
      <DataTable
        columns={dayColumns}
        data={nonWorking.data ?? []}
        getRowId={(row) => row.id}
        density="compact"
        loading={nonWorking.isLoading}
        error={nonWorking.isError}
        onRetry={() => void nonWorking.refetch()}
        errorTitle="Không tải được ngày nghỉ"
        emptyTitle="Chưa khai báo ngày nghỉ"
        emptyDescription="Hệ thống chưa có nguồn lịch làm việc hay nghỉ phép nào khác."
      />

      <Modal
        open={requirementOpen}
        onOpenChange={setRequirementOpen}
        title="Thêm quy tắc báo cáo"
        description="Quy tắc quyết định ai phải gửi, kỳ nào và hạn nào."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRequirementOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={() => saveRequirement.mutate()} loading={saveRequirement.isPending}>
              Lưu quy tắc
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField id="req-type" label="Loại báo cáo">
            {() => (
              <Select value={reportType} onValueChange={(value) => setReportType(value as ReportKind)}>
                <SelectTrigger aria-label="Loại báo cáo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Báo cáo ngày</SelectItem>
                  <SelectItem value="weekly">Báo cáo tuần</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="req-team" label="Phạm vi Team">
            {() => (
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger aria-label="Phạm vi Team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Toàn bộ Team</SelectItem>
                  {(teams.data ?? []).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="req-due" label="Giờ hạn gửi">
            {(control) => (
              <Input
                {...control}
                type="time"
                value={dueTime}
                onChange={(event) => setDueTime(event.target.value)}
              />
            )}
          </FormField>
          <FormField id="req-from" label="Hiệu lực từ">
            {(control) => (
              <Input
                {...control}
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            )}
          </FormField>
          <label className="flex items-center justify-between gap-3 text-body text-text-secondary">
            Bắt buộc xác nhận
            <Switch
              checked={reportType === "weekly" ? true : requiresAck}
              disabled={reportType === "weekly"}
              onCheckedChange={setRequiresAck}
              aria-label="Bắt buộc xác nhận"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-body text-text-secondary">
            Yêu cầu bằng chứng
            <Switch
              checked={requiresEvidence}
              onCheckedChange={setRequiresEvidence}
              aria-label="Yêu cầu bằng chứng"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={delegateOpen}
        onOpenChange={setDelegateOpen}
        title="Người kiểm tra thay thế"
        description="Trong thời gian hiệu lực, nghĩa vụ mới sẽ gán cho người thay thế."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDelegateOpen(false)}>
              Huỷ
            </Button>
            <Button
              onClick={() => saveDelegate.mutate()}
              disabled={principalId === NONE || delegateId === NONE || principalId === delegateId}
              loading={saveDelegate.isPending}
            >
              Lưu uỷ quyền
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField id="delegate-principal" label="Người được thay thế">
            {() => (
              <Select value={principalId} onValueChange={setPrincipalId}>
                <SelectTrigger aria-label="Người được thay thế">
                  <SelectValue placeholder="Chọn người" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Chọn người</SelectItem>
                  {memberOptions.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="delegate-person" label="Người thay thế">
            {() => (
              <Select value={delegateId} onValueChange={setDelegateId}>
                <SelectTrigger aria-label="Người thay thế">
                  <SelectValue placeholder="Chọn người" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Chọn người</SelectItem>
                  {memberOptions.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="delegate-start" label="Bắt đầu">
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                value={delegateStart}
                onChange={(event) => setDelegateStart(event.target.value)}
              />
            )}
          </FormField>
          <FormField id="delegate-end" label="Kết thúc (có thể bỏ trống)">
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                value={delegateEnd}
                onChange={(event) => setDelegateEnd(event.target.value)}
              />
            )}
          </FormField>
        </div>
      </Modal>

      <Modal
        open={dayOpen}
        onOpenChange={setDayOpen}
        title="Ngày không làm việc"
        description="Áp dụng cho kỳ tạo sau. Nghĩa vụ đã phát sinh cần đề nghị miễn và được phê duyệt."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDayOpen(false)}>
              Huỷ
            </Button>
            <Button
              onClick={() => saveDay.mutate()}
              disabled={!dayValue || !dayReason.trim()}
              loading={saveDay.isPending}
            >
              Lưu
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField id="nwd-day" label="Ngày">
            {(control) => (
              <Input
                {...control}
                type="date"
                value={dayValue}
                onChange={(event) => setDayValue(event.target.value)}
              />
            )}
          </FormField>
          <FormField id="nwd-team" label="Team (bỏ trống nếu áp dụng toàn bộ)">
            {() => (
              <Select value={dayTeam} onValueChange={setDayTeam}>
                <SelectTrigger aria-label="Team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Toàn bộ tổ chức</SelectItem>
                  {(teams.data ?? []).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="nwd-user" label="Cá nhân nghỉ phép (nếu có)">
            {() => (
              <Select value={dayUser} onValueChange={setDayUser}>
                <SelectTrigger aria-label="Cá nhân">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Không chọn</SelectItem>
                  {memberOptions.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="nwd-reason" label="Lý do">
            {(control) => (
              <Input
                {...control}
                value={dayReason}
                onChange={(event) => setDayReason(event.target.value)}
                placeholder="Ví dụ: nghỉ lễ, nghỉ phép đã duyệt."
              />
            )}
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
