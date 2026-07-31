import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DrawerPanel } from "@/components/ui/drawer-panel";
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
import type { FacilityRow, TeamRow } from "@/lib/org-data";
import { createProject } from "@/lib/project.functions";
import {
  createProjectIdea,
  syncProjectLinks,
  updateProjectDetail,
  type PersonOption,
  type ProjectRow,
} from "@/lib/project-data";

/**
 * CEN 1.0 — M2 form Dự án.
 * Chế độ "idea": Member gửi ý tưởng (tên, mục tiêu, mô tả).
 * Chế độ "full": CMO/Admin/Project Owner cập nhật dự án đã duyệt.
 */
const NO_OWNER = "__none__";

export interface ProjectFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = tạo ý tưởng mới. */
  project: ProjectRow | null;
  /** Cho phép sửa Owner, thời gian, Team, thành viên và Cơ sở. */
  fullEdit: boolean;
  /**
   * Chế độ tạo mới: "idea" = gửi ý tưởng (mặc định),
   * "official" = hành động "Tạo dự án" (yêu cầu quyền projects.create_official).
   */
  createMode?: "idea" | "official";
  currentUserId: string;
  teams: TeamRow[];
  facilities: FacilityRow[];
  people: PersonOption[];
  onCreated?: (projectId: string) => void;
}

interface FormState {
  name: string;
  objective: string;
  description: string;
  ownerId: string;
  startDate: string;
  deadline: string;
  teamIds: string[];
  memberIds: string[];
  facilityIds: string[];
}

function initialState(project: ProjectRow | null): FormState {
  return {
    name: project?.name ?? "",
    objective: project?.objective ?? "",
    description: project?.description ?? "",
    ownerId: project?.owner_id ?? NO_OWNER,
    startDate: project?.start_date ?? "",
    deadline: project?.deadline ?? "",
    teamIds: project?.teamIds ?? [],
    memberIds: project?.memberIds ?? [],
    facilityIds: project?.facilityIds ?? [],
  };
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function ProjectFormDrawer({
  open,
  onOpenChange,
  project,
  fullEdit,
  createMode = "idea",
  currentUserId,
  teams,
  facilities,
  people,
  onCreated,
}: ProjectFormDrawerProps) {
  const queryClient = useQueryClient();
  const isCreate = project === null;
  const isOfficialCreate = isCreate && createMode === "official";
  const showFullFields = fullEdit || isOfficialCreate;

  const [form, setForm] = React.useState<FormState>(() => initialState(project));
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(initialState(project));
      setErrors({});
      setFormError(null);
    }
  }, [open, project]);

  const activeFacilities = facilities.filter(
    (facility) => facility.is_active || form.facilityIds.includes(facility.id),
  );

  const mutation = useMutation({
    mutationFn: async (state: FormState) => {
      if (isOfficialCreate) {
        const result = await createProject({
          data: {
            name: state.name.trim(),
            objective: state.objective.trim(),
            description: state.description.trim() || null,
            ownerId: state.ownerId === NO_OWNER ? null : state.ownerId,
            startDate: state.startDate || null,
            deadline: state.deadline || null,
            teamIds: state.teamIds,
            memberIds: state.memberIds,
            facilityIds: state.facilityIds,
          },
        });
        return result.projectId;
      }

      if (isCreate) {
        return createProjectIdea({
          createdBy: currentUserId,
          name: state.name.trim(),
          objective: state.objective.trim(),
          description: state.description.trim() || null,
        });
      }

      await updateProjectDetail(project.id, {
        name: state.name.trim(),
        objective: state.objective.trim(),
        description: state.description.trim() || null,
        ownerId: fullEdit ? (state.ownerId === NO_OWNER ? null : state.ownerId) : project.owner_id,
        startDate: fullEdit ? state.startDate || null : project.start_date,
        deadline: fullEdit ? state.deadline || null : project.deadline,
      });

      if (fullEdit) {
        await syncProjectLinks("project_teams", project.id, project.teamIds, state.teamIds);
        await syncProjectLinks("project_members", project.id, project.memberIds, state.memberIds);
        await syncProjectLinks(
          "project_facilities",
          project.id,
          project.facilityIds,
          state.facilityIds,
        );
      }
      return project.id;
    },
    onSuccess: (projectId) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      cenToast.success(
        isOfficialCreate
          ? "Đã tạo dự án."
          : isCreate
            ? "Đã gửi ý tưởng dự án."
            : "Đã cập nhật dự án.",
      );
      onOpenChange(false);
      if (isCreate) onCreated?.(projectId);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  function validate(state: FormState) {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!state.name.trim()) next.name = "Nhập tên dự án.";
    else if (state.name.trim().length > 160) next.name = "Tên dự án tối đa 160 ký tự.";
    if (!state.objective.trim()) next.objective = "Nhập mục tiêu dự án.";
    if (state.description.length > 4000) next.description = "Mô tả tối đa 4000 ký tự.";
    if (showFullFields && state.startDate && state.deadline && state.deadline < state.startDate) {
      next.deadline = "Deadline không được trước ngày bắt đầu.";
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

  return (
    <DrawerPanel
      open={open}
      onOpenChange={mutation.isPending ? () => undefined : onOpenChange}
      title={isOfficialCreate ? "Tạo dự án" : isCreate ? "Gửi ý tưởng dự án" : "Cập nhật dự án"}
      description={
        isOfficialCreate
          ? "Dự án mới bắt đầu ở trạng thái Ý tưởng và đi theo quy trình duyệt hiện hành."
          : isCreate
            ? "Ý tưởng sẽ được Leader của Team chính xem xét trước khi trình CMO."
            : "Thay đổi quan trọng đều được ghi vào lịch sử dự án."
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
          <Button type="submit" form="project-form" loading={mutation.isPending}>
            {isOfficialCreate ? "Tạo dự án" : isCreate ? "Gửi ý tưởng" : "Lưu thay đổi"}
          </Button>
        </div>
      }
    >
      <form id="project-form" className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <p className="rounded-badge border border-state-danger/40 bg-state-danger/10 px-3 py-2 text-body-sm text-state-danger">
            {formError}
          </p>
        ) : null}

        <FormField id="project-name" label="Tên dự án" required error={errors.name}>
          {(control) => (
            <Input
              {...control}
              value={form.name}
              maxLength={160}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          )}
        </FormField>

        <FormField id="project-objective" label="Mục tiêu" required error={errors.objective}>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={form.objective}
              onChange={(event) => setForm((prev) => ({ ...prev, objective: event.target.value }))}
            />
          )}
        </FormField>

        <FormField
          id="project-description"
          label="Mô tả / kế hoạch cơ bản"
          helperText="Không bắt buộc"
          error={errors.description}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          )}
        </FormField>

        {showFullFields ? (
          <>
            <FormField
              id="project-owner"
              label="Project Owner"
              required
              helperText="Chỉ chọn nhân sự đang hoạt động"
            >
              {(control) => (
                <Select
                  value={form.ownerId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, ownerId: value }))}
                >
                  <SelectTrigger id={control.id}>
                    <SelectValue placeholder="Chọn Project Owner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_OWNER}>Chưa chỉ định</SelectItem>
                    {people.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="project-start" label="Ngày bắt đầu">
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, startDate: event.target.value }))
                    }
                  />
                )}
              </FormField>
              <FormField id="project-deadline" label="Deadline" error={errors.deadline}>
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={form.deadline}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, deadline: event.target.value }))
                    }
                  />
                )}
              </FormField>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-label font-medium text-text-secondary">Team tham gia</legend>
              <div className="flex flex-col gap-2 rounded-card border border-border-default p-3">
                {teams.length === 0 ? (
                  <p className="text-body-sm text-text-muted">Chưa có Team nào.</p>
                ) : (
                  teams.map((team) => (
                    <label key={team.id} className="flex items-center gap-2 text-body-sm">
                      <Checkbox
                        checked={form.teamIds.includes(team.id)}
                        onCheckedChange={() =>
                          setForm((prev) => ({ ...prev, teamIds: toggle(prev.teamIds, team.id) }))
                        }
                      />
                      <span className="min-w-0 break-words">{team.name}</span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-label font-medium text-text-secondary">
                Thành viên tham gia
              </legend>
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-card border border-border-default p-3">
                {people.map((person) => (
                  <label key={person.id} className="flex items-center gap-2 text-body-sm">
                    <Checkbox
                      checked={form.memberIds.includes(person.id)}
                      onCheckedChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          memberIds: toggle(prev.memberIds, person.id),
                        }))
                      }
                    />
                    <span className="min-w-0 break-words">{person.display_name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-label font-medium text-text-secondary">Cơ sở liên quan</legend>
              <div className="flex flex-col gap-2 rounded-card border border-border-default p-3">
                {activeFacilities.length === 0 ? (
                  <p className="text-body-sm text-text-muted">Chưa có Cơ sở đang hoạt động.</p>
                ) : (
                  activeFacilities.map((facility) => (
                    <label key={facility.id} className="flex items-center gap-2 text-body-sm">
                      <Checkbox
                        checked={form.facilityIds.includes(facility.id)}
                        onCheckedChange={() =>
                          setForm((prev) => ({
                            ...prev,
                            facilityIds: toggle(prev.facilityIds, facility.id),
                          }))
                        }
                      />
                      <span className="min-w-0 break-words">{facility.name}</span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>
          </>
        ) : null}
      </form>
    </DrawerPanel>
  );
}
