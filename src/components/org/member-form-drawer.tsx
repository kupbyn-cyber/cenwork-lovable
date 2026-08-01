import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import { createMemberAccount, setMemberRole } from "@/lib/org.functions";
import { isSystemAdminRole, roleRequiresTeam } from "@/lib/permissions";
import {
  ROLE_LABEL,
  replaceCollaboratorTeams,
  updateMemberProfile,
  type AppRole,
  type MemberRow,
  type TeamRow,
} from "@/lib/org-data";

const NO_TEAM = "__none__";
const ROLES: AppRole[] = ["admin", "cmo", "leader", "member"];

export interface MemberFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = tạo mới. */
  member: MemberRow | null;
  teams: TeamRow[];
}

interface FormState {
  displayName: string;
  email: string;
  jobTitle: string;
  role: AppRole;
  primaryTeamId: string;
  collaboratorTeamIds: string[];
  password: string;
  telegramUserId: string;
  telegramEnabled: boolean;
}

function initialState(member: MemberRow | null): FormState {
  return {
    displayName: member?.display_name ?? "",
    email: member?.email ?? "",
    jobTitle: member?.job_title ?? "",
    role: member?.role ?? "member",
    primaryTeamId: member?.primary_team_id ?? NO_TEAM,
    collaboratorTeamIds: member?.collaboratorTeamIds ?? [],
    password: "",
    telegramUserId: member?.telegram_user_id ?? "",
    telegramEnabled: member?.telegram_enabled ?? true,
  };
}

export function MemberFormDrawer({ open, onOpenChange, member, teams }: MemberFormDrawerProps) {
  const access = useOrgAccess();
  const queryClient = useQueryClient();
  const isCreate = member === null;

  const [form, setForm] = React.useState<FormState>(() => initialState(member));
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(initialState(member));
      setErrors({});
      setFormError(null);
    }
  }, [open, member]);

  const canEditRoleTeam = access.canChangeRoleOrTeam;
  /** Admin và CMO quản trị toàn hệ thống: Team chỉ là thông tin hồ sơ. */
  const systemWide = isSystemAdminRole(form.role);
  const teamRequired = roleRequiresTeam(form.role);

  const mutation = useMutation({
    mutationFn: async (values: FormState) => {
      const primaryTeamId = values.primaryTeamId === NO_TEAM ? null : values.primaryTeamId;
      const collaborators = values.collaboratorTeamIds.filter((id) => id !== primaryTeamId);

      if (isCreate) {
        await createMemberAccount({
          data: {
            email: values.email.trim(),
            displayName: values.displayName.trim(),
            jobTitle: values.jobTitle.trim() || null,
            role: values.role,
            primaryTeamId,
            collaboratorTeamIds: collaborators,
            initialPassword: values.password,
          },
        });
        return;
      }

      await updateMemberProfile({
        id: member.id,
        display_name: values.displayName.trim(),
        job_title: values.jobTitle.trim() || null,
        primary_team_id: primaryTeamId,
        canChangePrimaryTeam: canEditRoleTeam,
        telegram_user_id: values.telegramUserId.trim() || null,
        telegram_enabled: values.telegramEnabled,
      });
      if (canEditRoleTeam && values.role !== member.role) {
        await setMemberRole({ data: { userId: member.id, role: values.role } });
      }
      await replaceCollaboratorTeams(member.id, collaborators);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      cenToast.success(isCreate ? "Đã tạo tài khoản thành viên." : "Đã lưu thông tin thành viên.");
      onOpenChange(false);
    },
    onError: (error: Error) => setFormError(error.message),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.displayName.trim()) next.displayName = "Vui lòng nhập tên hiển thị.";
    if (isCreate) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
        next.email = "Email không đúng định dạng.";
      if (form.password.length < 8) next.password = "Mật khẩu khởi tạo tối thiểu 8 ký tự.";
    }
    if (canEditRoleTeam && teamRequired && form.primaryTeamId === NO_TEAM)
      next.primaryTeamId = "Vai trò Leader và Member bắt buộc thuộc một Team chính.";

    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;
    mutation.mutate(form);
  }

  return (
    <DrawerPanel
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        onOpenChange(next);
      }}
      title={isCreate ? "Thêm thành viên" : "Sửa thông tin thành viên"}
      description={
        isCreate
          ? "Tài khoản được tạo qua backend an toàn và có thể đăng nhập ngay."
          : "Cập nhật thông tin hồ sơ và phạm vi Team."
      }
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Hủy
          </Button>
          <Button type="submit" form="member-form" loading={mutation.isPending}>
            {isCreate ? "Tạo tài khoản" : "Lưu thay đổi"}
          </Button>
        </>
      }
    >
      <form id="member-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <FormField
          id="member-name"
          label="Tên hiển thị"
          required
          {...(errors.displayName ? { error: errors.displayName } : {})}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={form.displayName}
              maxLength={80}
              onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
            />
          )}
        </FormField>

        <FormField
          id="member-email"
          label="Email"
          required
          helperText={isCreate ? "Email dùng để đăng nhập, không được trùng." : "Email không thể thay đổi."}
          {...(errors.email ? { error: errors.email } : {})}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              type="email"
              value={form.email}
              readOnly={!isCreate}
              onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            />
          )}
        </FormField>

        {isCreate ? (
          <FormField
            id="member-password"
            label="Mật khẩu khởi tạo"
            required
            helperText="Tối thiểu 8 ký tự. Thành viên tự đổi trong Hồ sơ cá nhân."
            {...(errors.password ? { error: errors.password } : {})}
          >
            {(controlProps) => (
              <PasswordInput
                {...controlProps}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
              />
            )}
          </FormField>
        ) : null}

        <FormField
          id="member-job-title"
          label="Chức danh chuyên môn"
          helperText="Chỉ mang tính mô tả, không tạo quyền hệ thống."
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={form.jobTitle}
              maxLength={120}
              onChange={(e) => setForm((s) => ({ ...s, jobTitle: e.target.value }))}
            />
          )}
        </FormField>

        <FormField
          id="member-role"
          label="Vai trò hệ thống"
          required
          {...(canEditRoleTeam ? {} : { helperText: "Chỉ Admin hoặc CMO được đổi vai trò." })}
        >
          {(controlProps) => (
            <Select
              value={form.role}
              disabled={!canEditRoleTeam}
              onValueChange={(value) => setForm((s) => ({ ...s, role: value as AppRole }))}
            >
              <SelectTrigger id={controlProps.id} aria-describedby={controlProps["aria-describedby"]}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        {systemWide ? (
          <p className="rounded-control border border-border-default bg-surface-subtle px-3 py-2 text-helper text-text-secondary">
            Phạm vi dữ liệu: <strong className="text-text-primary">Toàn hệ thống</strong>. Vai trò
            này có quyền quản trị toàn hệ thống. Team chỉ là thông tin hồ sơ.
          </p>
        ) : null}

        <FormField
          id="member-primary-team"
          label="Team chính"
          required={teamRequired}
          {...(!canEditRoleTeam
            ? { helperText: "Chỉ Admin hoặc CMO được đổi Team chính." }
            : systemWide
              ? { helperText: "Không bắt buộc với Admin và CMO." }
              : { helperText: "Bắt buộc với Leader và Member." })}
          {...(errors.primaryTeamId ? { error: errors.primaryTeamId } : {})}
        >
          {(controlProps) => (
            <Select
              value={form.primaryTeamId}
              disabled={!canEditRoleTeam}
              onValueChange={(value) =>
                setForm((s) => ({
                  ...s,
                  primaryTeamId: value,
                  collaboratorTeamIds: s.collaboratorTeamIds.filter((id) => id !== value),
                }))
              }
            >
              <SelectTrigger id={controlProps.id} aria-describedby={controlProps["aria-describedby"]}>
                <SelectValue placeholder="Chọn Team chính" />
              </SelectTrigger>
              <SelectContent>
                {systemWide ? <SelectItem value={NO_TEAM}>Chưa gán Team</SelectItem> : null}
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        {!isCreate ? (
          <>
            <FormField
              id="member-telegram-id"
              label="Telegram User ID"
              helperText="Không bắt buộc. Dùng để gửi thông báo Telegram cá nhân."
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={form.telegramUserId}
                  maxLength={32}
                  placeholder="Ví dụ: 123456789"
                  onChange={(e) => setForm((s) => ({ ...s, telegramUserId: e.target.value }))}
                />
              )}
            </FormField>
            <label className="flex min-w-0 items-center gap-2.5 text-label text-text-primary">
              <Checkbox
                checked={form.telegramEnabled}
                onCheckedChange={(value) =>
                  setForm((s) => ({ ...s, telegramEnabled: value === true }))
                }
              />
              <span className="min-w-0">Nhận thông báo Telegram cá nhân</span>
            </label>
          </>
        ) : null}

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-label font-medium text-text-secondary">Team phối hợp</legend>
          <p className="text-helper text-text-muted">
            Có thể chọn nhiều Team, không gồm Team chính.
          </p>
          {teams.length === 0 ? (
            <p className="text-helper text-text-muted">Chưa có Team nào trong hệ thống.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {teams
                .filter((team) => team.id !== form.primaryTeamId)
                .map((team) => {
                  const checked = form.collaboratorTeamIds.includes(team.id);
                  return (
                    <label
                      key={team.id}
                      className="flex min-w-0 items-center gap-2.5 text-label text-text-primary"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setForm((s) => ({
                            ...s,
                            collaboratorTeamIds: value
                              ? [...s.collaboratorTeamIds, team.id]
                              : s.collaboratorTeamIds.filter((id) => id !== team.id),
                          }))
                        }
                      />
                      <span className="min-w-0 truncate">{team.name}</span>
                    </label>
                  );
                })}
            </div>
          )}
        </fieldset>

        {formError ? (
          <p
            role="alert"
            className="rounded-control border border-state-danger/50 bg-state-danger-surface px-3 py-2 text-helper text-state-danger"
          >
            {formError}
          </p>
        ) : null}
      </form>
    </DrawerPanel>
  );
}
