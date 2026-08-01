import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EntityAvatar } from "@/components/ui/avatar";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PageHeader } from "@/components/ui/page-header";
import { cenToast } from "@/components/ui/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminSettingsSection } from "@/components/settings/admin-settings-section";
import { useOrgAccess } from "@/hooks/use-org-access";
import { logSelfAuditEvent } from "@/lib/audit-data";
import { getDisplayName, useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Cài đặt — CEN WORK" },
      {
        name: "description",
        content: "Xem hồ sơ cá nhân, cập nhật tên hiển thị và đổi mật khẩu tài khoản CEN WORK.",
      },
      { property: "og:title", content: "Hồ sơ cá nhân — CEN WORK" },
      {
        property: "og:description",
        content: "Xem hồ sơ cá nhân, cập nhật tên hiển thị và đổi mật khẩu tài khoản CEN WORK.",
      },
    ],
  }),
  component: SettingsPage,
});

function ProfileSection() {
  const { user } = useAuth();
  const currentName = getDisplayName(user);
  const [name, setName] = React.useState(currentName);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(currentName);
  }, [currentName]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const value = name.trim();
    if (!value) {
      setError("Vui lòng nhập tên hiển thị.");
      return;
    }
    if (value.length > 80) {
      setError("Tên hiển thị tối đa 80 ký tự.");
      return;
    }
    setError(undefined);
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({
      data: { display_name: value },
    });
    setSaving(false);
    if (updateError) {
      setError("Không cập nhật được tên hiển thị. Vui lòng thử lại.");
      return;
    }
    cenToast.success("Đã cập nhật tên hiển thị.");
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Hồ sơ cá nhân</CardTitle>
          <CardDescription>Thông tin của tài khoản đang đăng nhập.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <EntityAvatar name={currentName || user?.email || ""} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-label font-semibold text-text-primary">
              {currentName || "Chưa đặt tên hiển thị"}
            </p>
            <p className="truncate text-helper text-text-muted">{user?.email}</p>
          </div>
        </div>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <FormField
            id="profile-name"
            label="Tên hiển thị"
            required
            helperText="Tên này hiển thị trong hệ thống."
            {...(error ? { error } : {})}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={name}
                maxLength={80}
                disabled={saving}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </FormField>

          <FormField
            id="profile-email"
            label="Email đăng nhập"
            helperText="Email do quản trị hệ thống cấp, không thể tự thay đổi."
          >
            {(controlProps) => <Input {...controlProps} value={user?.email ?? ""} readOnly />}
          </FormField>

          <div>
            <Button type="submit" loading={saving} disabled={name.trim() === currentName}>
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordSection() {
  const { user } = useAuth();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const nextErrors: { password?: string; confirm?: string } = {};
    if (!password) nextErrors.password = "Vui lòng nhập mật khẩu mới.";
    if (!confirm) nextErrors.confirm = "Vui lòng xác nhận mật khẩu mới.";
    else if (password !== confirm) nextErrors.confirm = "Hai mật khẩu chưa trùng nhau.";

    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setPassword("");
    setConfirm("");
    if (user?.id) {
      await logSelfAuditEvent(user.id, "account.password_changed").catch(() => undefined);
    }
    cenToast.success("Đã đổi mật khẩu.");
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Đổi mật khẩu</CardTitle>
          <CardDescription>
            Mật khẩu mới áp dụng theo chính sách bảo mật của hệ thống xác thực.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <FormField
            id="new-password"
            label="Mật khẩu mới"
            required
            {...(errors.password ? { error: errors.password } : {})}
          >
            {(controlProps) => (
              <PasswordInput
                {...controlProps}
                autoComplete="new-password"
                value={password}
                disabled={saving}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </FormField>

          <FormField
            id="confirm-password"
            label="Xác nhận mật khẩu mới"
            required
            {...(errors.confirm ? { error: errors.confirm } : {})}
          >
            {(controlProps) => (
              <PasswordInput
                {...controlProps}
                autoComplete="new-password"
                value={confirm}
                disabled={saving}
                onChange={(e) => setConfirm(e.target.value)}
              />
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

          <div>
            <Button type="submit" loading={saving}>
              Đổi mật khẩu
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SettingsPage() {
  const access = useOrgAccess();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Cài đặt"
        description="Hồ sơ cá nhân, bảo mật và cấu hình quản trị của hệ thống CEN."
      />
      <Tabs defaultValue="account" className="min-w-0">
        <TabsList>
          <TabsTrigger value="account">Cá nhân và bảo mật</TabsTrigger>
          {access.canManageSettings ? (
            <TabsTrigger value="system">Quản trị hệ thống</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="account">
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <ProfileSection />
            <PasswordSection />
          </div>
        </TabsContent>
        {access.canManageSettings ? (
          <TabsContent value="system">
            <AdminSettingsSection />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
