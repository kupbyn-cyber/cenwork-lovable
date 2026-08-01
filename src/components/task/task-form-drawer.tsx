import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cenToast } from "@/components/ui/toast";
import { hanoiStartOfDayMs, hanoiToUtcISO, utcToHanoiInputs } from "@/lib/datetime";
import type { TeamRow } from "@/lib/org-data";
import { isProjectApproved, type PersonOption, type ProjectRow } from "@/lib/project-data";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  canAssignToOthers,
  canCreateProjectTask,
  canManageTask,
  createTask,
  syncTaskParticipants,
  updateTask,
  type TaskAccessContext,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
} from "@/lib/task-data";

/**
 * CEN 1.0 — M3.1 form Task.
 * Người phụ trách chỉ sửa được nội dung và tiến độ; phạm vi (dự án, người phụ trách,
 * Team, người tham gia) chỉ mở cho người có quyền quản lý Task.
 */
const NONE = "__none__";

export interface TaskFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = tạo Task mới. */
  task: TaskRow | null;
  ctx: TaskAccessContext;
  projects: ProjectRow[];
  teams: TeamRow[];
  people: PersonOption[];
  /** Khóa sẵn dự án (khi tạo từ màn hình dự án). */
  lockedProjectId?: string | null;
  onCreated?: (taskId: string) => void;
}

interface FormState {
  name: string;
  description: string;
  projectId: string;
  assigneeId: string;
  teamId: string;
  startDate: string;
  /** Ngày deadline theo giờ Hà Nội (yyyy-MM-dd). */
  deadlineDate: string;
  /** Giờ deadline theo giờ Hà Nội (HH:mm). */
  deadlineTime: string;
  priority: TaskPriority;
  status: TaskStatus;
  participantIds: string[];
}

function initialState(
  task: TaskRow | null,
  ctx: TaskAccessContext,
  lockedProjectId?: string | null,
): FormState {
  const deadline = utcToHanoiInputs(task?.deadline ?? null);
  return {
    name: task?.name ?? "",
    description: task?.description ?? "",
    projectId: task?.project_id ?? lockedProjectId ?? NONE,
    assigneeId: task?.assignee_id ?? ctx.userId ?? "",
    teamId: task?.team_id ?? NONE,
    startDate: task?.start_date ?? "",
    deadlineDate: deadline.date,
    deadlineTime: deadline.time || (task ? "" : "17:00"),
    priority: task?.priority ?? "medium",
    status: task?.status ?? "not_started",
    participantIds: task?.participantIds ?? [],
  };
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function TaskFormDrawer({
  open,
  onOpenChange,
  task,
  ctx,
  projects,
  teams,
  people,
  lockedProjectId,
  onCreated,
}: TaskFormDrawerProps) {
  const queryClient = useQueryClient();
  const isCreate = task === null;
  const canScope = isCreate ? true : canManageTask(task, ctx);
  const allowOthers = canAssignToOthers(ctx);
  const allowProject = canCreateProjectTask(ctx);

  const [form, setForm] = React.useState<FormState>(() => initialState(task, ctx, lockedProjectId));
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(initialState(task, ctx, lockedProjectId));
      setErrors({});
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, lockedProjectId]);

  /** Dự án chưa duyệt không được tạo Task (ràng buộc thật ở database). */
  const selectableProjects = projects.filter(
    (project) =>
      (isProjectApproved(project) && project.status !== "archived") ||
      project.id === form.projectId,
  );

  const mutation = useMutation({
    mutationFn: async (state: FormState) => {
      const payload = {
        name: state.name.trim(),
        description: state.description.trim() || null,
        projectId: state.projectId === NONE ? null : state.projectId,
        assigneeId: state.assigneeId,
        teamId: state.teamId === NONE ? null : state.teamId,
        startDate: state.startDate || null,
        deadline: hanoiToUtcISO(state.deadlineDate, state.deadlineTime)!,
        priority: state.priority,
        status: state.status,
      };

      if (isCreate) {
        const id = await createTask({ ...payload, createdBy: ctx.userId! });
        if (state.participantIds.length > 0) {
          await syncTaskParticipants(id, [], state.participantIds);
        }
        return id;
      }

      await updateTask(
        task.id,
        canScope
          ? payload
          : {
              name: payload.name,
              description: payload.description,
              startDate: payload.startDate,
              deadline: payload.deadline,
              priority: payload.priority,
              status: payload.status,
            },
      );
      if (canScope) {
        await syncTaskParticipants(task.id, task.participantIds, state.participantIds);
      }
      return task.id;
    },
    onSuccess: (taskId) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["task-history", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      cenToast.success(isCreate ? "Đã tạo công việc." : "Đã cập nhật công việc.");
      onOpenChange(false);
      if (isCreate) onCreated?.(taskId);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  function validate(state: FormState) {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!state.name.trim()) next.name = "Nhập tên công việc.";
    else if (state.name.trim().length > 160) next.name = "Tên công việc tối đa 160 ký tự.";
    if (state.description.length > 4000) next.description = "Mô tả tối đa 4000 ký tự.";
    if (!state.assigneeId) next.assigneeId = "Chọn người phụ trách.";
    if (!state.deadlineDate || !state.deadlineTime) {
      next.deadlineDate = "Chọn đầy đủ ngày và giờ deadline.";
      return next;
    }
    const deadlineIso = hanoiToUtcISO(state.deadlineDate, state.deadlineTime);
    if (!deadlineIso) {
      next.deadlineDate = "Deadline không hợp lệ.";
      return next;
    }
    if (state.startDate) {
      const start = hanoiStartOfDayMs(state.startDate);
      if (start !== null && new Date(deadlineIso).getTime() < start) {
        next.deadlineDate = "Deadline không được trước ngày/giờ bắt đầu.";
      }
    }
    return next;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    setFormError(null);
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate(form);
  }

  const assigneeOptions = allowOthers
    ? people
    : people.filter((person) => person.id === ctx.userId);

  return (
    <Modal
      size="xl"
      open={open}
      onOpenChange={mutation.isPending ? () => undefined : onOpenChange}
      title={isCreate ? "Tạo công việc" : "Chỉnh sửa công việc"}
      description={
        canScope
          ? "Công việc có thể thuộc một dự án hoặc đứng độc lập."
          : "Bạn là người phụ trách: chỉ cập nhật được nội dung và tiến độ."
      }
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Hủy
          </Button>
          <Button type="submit" form="task-form" loading={mutation.isPending}>
            {isCreate ? "Tạo công việc" : "Lưu thay đổi"}
          </Button>
        </div>
      }
    >
      <form id="task-form" className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <p role="alert" className="text-body-sm text-state-danger">
            {formError}
          </p>
        ) : null}

        <FormField id="task-name" label="Tên công việc" required error={errors.name}>
          {(control) => (
            <Input
              {...control}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ví dụ: Chuẩn bị nội dung truyền thông tuần 1"
            />
          )}
        </FormField>

        <FormField id="task-description" label="Mô tả" error={errors.description}>
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Mô tả phạm vi, yêu cầu hoặc kết quả cần đạt."
            />
          )}
        </FormField>

        {canScope ? (
          <FormField
            id="task-project"
            label="Dự án"
            helperText={
              allowProject
                ? "Để trống nếu đây là công việc độc lập."
                : "Bạn chỉ tạo được công việc độc lập."
            }
          >
            {(control) => (
              <Select
                value={form.projectId}
                onValueChange={(value) => setForm({ ...form, projectId: value })}
                disabled={!allowProject || Boolean(lockedProjectId)}
              >
                <SelectTrigger {...control} aria-label="Dự án">
                  <SelectValue placeholder="Công việc độc lập" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Công việc độc lập</SelectItem>
                  {selectableProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : null}

        {canScope ? (
          <FormField
            id="task-assignee"
            label="Người phụ trách"
            required
            error={errors.assigneeId}
            helperText={allowOthers ? undefined : "Bạn chỉ được tự nhận việc."}
          >
            {(control) => (
              <Select
                value={form.assigneeId}
                onValueChange={(value) => setForm({ ...form, assigneeId: value })}
                disabled={!allowOthers}
              >
                <SelectTrigger {...control} aria-label="Người phụ trách">
                  <SelectValue placeholder="Chọn người phụ trách" />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : null}

        {canScope ? (
          <FormField id="task-team" label="Team phụ trách">
            {(control) => (
              <Select
                value={form.teamId}
                onValueChange={(value) => setForm({ ...form, teamId: value })}
              >
                <SelectTrigger {...control} aria-label="Team phụ trách">
                  <SelectValue placeholder="Không gắn Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Không gắn Team</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="task-start" label="Ngày bắt đầu">
            {(control) => (
              <Input
                {...control}
                type="date"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
            )}
          </FormField>
          <FormField id="task-deadline" label="Deadline" required error={errors.deadlineDate}>
            {(control) => (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  {...control}
                  type="date"
                  className="w-full sm:flex-1 sm:min-w-0"
                  value={form.deadlineDate}
                  onChange={(event) => setForm({ ...form, deadlineDate: event.target.value })}
                />
                <Input
                  type="time"
                  aria-label="Giờ deadline"
                  step={60}
                  className="w-full sm:w-[120px] sm:shrink-0"
                  value={form.deadlineTime}
                  onChange={(event) => setForm({ ...form, deadlineTime: event.target.value })}
                />
              </div>
            )}
          </FormField>

          <FormField id="task-priority" label="Mức ưu tiên">
            {(control) => (
              <Select
                value={form.priority}
                onValueChange={(value) => setForm({ ...form, priority: value as TaskPriority })}
              >
                <SelectTrigger {...control} aria-label="Mức ưu tiên">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITY_ORDER.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {TASK_PRIORITY_LABEL[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="task-status" label="Trạng thái">
            {(control) => (
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value as TaskStatus })}
              >
                <SelectTrigger {...control} aria-label="Trạng thái">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TASK_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>

        {canScope ? (
          <FormField
            id="task-participants"
            label="Người tham gia"
            helperText="Người tham gia xem được công việc nhưng không phải người phụ trách."
          >
            {() => (
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-control border border-border-default p-3">
                {people.length === 0 ? (
                  <span className="text-body-sm text-text-muted">Chưa có nhân sự khả dụng.</span>
                ) : (
                  people
                    .filter((person) => person.id !== form.assigneeId)
                    .map((person) => (
                      <label key={person.id} className="flex items-center gap-2 text-body-sm">
                        <Checkbox
                          checked={form.participantIds.includes(person.id)}
                          onCheckedChange={() =>
                            setForm({
                              ...form,
                              participantIds: toggle(form.participantIds, person.id),
                            })
                          }
                          aria-label={person.display_name}
                        />
                        <span className="min-w-0 break-words">{person.display_name}</span>
                      </label>
                    ))
                )}
              </div>
            )}
          </FormField>
        ) : null}
      </form>
    </Modal>
  );
}
