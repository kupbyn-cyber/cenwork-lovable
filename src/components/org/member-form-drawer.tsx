import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { FormModal } from "@/components/ui/form-modal";
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
  JOB_TITLES,
  ROLE_LABEL,
  updateMemberProfile,
  validateContactFields,
  type AppRole,
  type MemberRow,
  type TeamRow,
} from "@/lib/org-data";

const NO_TEAM = "__none__";
const NO_JOB_TITLE = "__no_job__";
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
  password: string;
  phoneNumber: string;
  birthday: string;
  telegramUserId: string;
}

function initialState(member: MemberRow | null): FormState {
  return {
    displayName: member?.display_name ?? "",
    email: member?.email ?? "",
    jobTitle: member?.job_title ?? "",
    role: member?.role ?? "member",
    primaryTeamId: member?.primary_team_id ?? NO_TEAM,
    password: "",
    phoneNumber: member?.phone_number ?? "",
    birthday: member?.birthday ?? "",
    telegramUserId: member?.telegram_user_id ?? "",
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

      if (isCreate) {
        await createMemberAccount({
          data: {
            email: values.email.trim(),
            displayName: values.displayName.trim(),
            jobTitle: values.jobTitle.trim() || null,
            role: values.role,
            primaryTeamId,
            initialPassword: values.password,
            phoneNumber: values.phoneNumber.trim(),
            birthday: values.birthday,
            telegramUserId: values.telegramUserId.trim() || null,
          },
        });
        return;
      }

      await updateMemberProfile({
        id: member.id,
        display_name: values.displayName.trim(),
        job_title: values.jobTitle.trim() || null,
        primary_team_id: primaryTeamId,
        phone_number: values.phoneNumber.trim(),
        birthday: values.birthday,
        canChangePrimaryTeam: canEditRoleTeam,
        telegram_user_id: values.telegramUserId.trim() || null,
      });
      if (canEditRoleTeam && values.role !== member.role) {
        await setMemberRole({ data: { userId: member.id, role: values.role } });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      // PERF-03: dropdown nhân sự dùng cache riêng, phải làm mới sau khi đổi hồ sơ/Team.
      void queryClient.invalidateQueries({ queryKey: ["active-people"] });
      void queryClient.invalidateQueries({ queryKey: ["reviewer-directory"] });
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
    if (form.jobTitle && !JOB_TITLES.includes(form.jobTitle as (typeof JOB_TITLES)[number]))
      next.jobTitle = "Chức danh cũ không hợp lệ, vui lòng chọn lại.";
    const contactErrors = validateContactFields({
      phone_number: form.phoneNumber,
      birthday: form.birthday,
    });
    if (contactErrors.phone_number) next.phoneNumber = contactErrors.phone_number;
    if (contactErrors.birthday) next.birthday = contactErrors.birthday;
    if (canEditRoleTeam && teamRequired && form.primaryTeamId === NO_TEAM)
      next.primaryTeamId = "Vai trò Leader và Member bắt buộc thuộc một Team chính.";

    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;
    mutation.mutate(form);
  }

  return (
    <FormModal
      open={open}
      size="lg"
      dirty={JSON.stringify(form) !== JSON.stringify(initialState(member))}
      busy={mutation.isPending}
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
          helperText={
            isCreate ? "Email dùng để đăng nhập, không được trùng." : "Email không thể thay đổi."
          }
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
          label="Chức danh"
          helperText="Thông tin tổ chức, độc lập với vai trò hệ thống."
          {...(errors.jobTitle ? { error: errors.jobTitle } : {})}
        >
          {(controlProps) => (
            <Select
              value={form.jobTitle || NO_JOB_TITLE}
              onValueChange={(value) =>
                setForm((s) => ({ ...s, jobTitle: value === NO_JOB_TITLE ? "" : value }))
              }
            >
              <SelectTrigger
                id={controlProps.id}
                aria-describedby={controlProps["aria-describedby"]}
              >
                <SelectValue placeholder="Chọn chức danh" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_JOB_TITLE}>Chưa đặt chức danh</SelectItem>
                {JOB_TITLES.map((title) => (
                  <SelectItem key={title} value={title}>
                    {title}
                  </SelectItem>
                ))}
                {/* Giá trị cũ ngoài danh sách: giữ nguyên để không mất dữ liệu, Admin/CMO chọn lại khi sửa. */}
                {form.jobTitle &&
                !JOB_TITLES.includes(form.jobTitle as (typeof JOB_TITLES)[number]) ? (
                  <SelectItem value={form.jobTitle}>{form.jobTitle} (giá trị cũ)</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="member-phone"
            label="Số điện thoại"
            required
            helperText="Bắt buộc. Dùng để liên hệ nội bộ."
            {...(errors.phoneNumber ? { error: errors.phoneNumber } : {})}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                type="tel"
                inputMode="tel"
                maxLength={20}
                value={form.phoneNumber}
                onChange={(e) => setForm((s) => ({ ...s, phoneNumber: e.target.value }))}
              />
            )}
          </FormField>

          <FormField
            id="member-birthday"
            label="Ngày sinh"
            required
            helperText="Bắt buộc. Không được lớn hơn ngày hiện tại."
            {...(errors.birthday ? { error: errors.birthday } : {})}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.birthday}
                onChange={(e) => setForm((s) => ({ ...s, birthday: e.target.value }))}
              />
            )}
          </FormField>
        </div>

        <FormField
          id="member-telegram-id"
          label="Telegram User ID"
          helperText="Dùng để gửi thông báo Telegram cá nhân. Có thể bổ sung sau."
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
              <SelectTrigger
                id={controlProps.id}
                aria-describedby={controlProps["aria-describedby"]}
              >
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
                }))
              }
            >
              <SelectTrigger
                id={controlProps.id}
                aria-describedby={controlProps["aria-describedby"]}
              >
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

        {formError ? (
          <p
            role="alert"
            className="rounded-control border border-state-danger/50 bg-state-danger-surface px-3 py-2 text-helper text-state-danger"
          >
            {formError}
          </p>
        ) : null}
      </form>
    </FormModal>
  );
}
