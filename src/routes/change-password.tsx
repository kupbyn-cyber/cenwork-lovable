import * as React from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PasswordInput } from "@/components/ui/password-input";
import { cenToast } from "@/components/ui/toast";
import { supabase } from "@/integrations/cen/client";

/**
 * CEN WORK — Đổi mật khẩu bắt buộc sau lần đăng nhập đầu tiên.
 * Không hiển thị/ghi log giá trị mật khẩu ở bất kỳ đâu.
 */
export const Route = createFileRoute("/change-password")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.must_change_password) throw redirect({ to: "/" });
    return { user: data.user };
  },
  head: () => ({
    meta: [
      { title: "Đổi mật khẩu bắt buộc — CEN WORK" },
      {
        name: "description",
        content: "Đặt mật khẩu mới cho tài khoản CEN WORK trước khi sử dụng hệ thống.",
      },
      { property: "og:title", content: "Đổi mật khẩu bắt buộc — CEN WORK" },
      {
        property: "og:description",
        content: "Đặt mật khẩu mới cho tài khoản CEN WORK trước khi sử dụng hệ thống.",
      },
    ],
  }),
  component: ChangePasswordPage,
});

/** Tối thiểu 8 ký tự, có cả chữ và số. */
function validatePassword(value: string): string | undefined {
  if (value.length < 8) return "Mật khẩu tối thiểu 8 ký tự.";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value))
    return "Mật khẩu phải gồm cả chữ và số.";
  return undefined;
}

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const nextErrors: { password?: string; confirm?: string } = {};
    const passwordError = validatePassword(password);
    if (passwordError) nextErrors.password = passwordError;
    if (password !== confirm) nextErrors.confirm = "Hai mật khẩu chưa trùng nhau.";
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    const { error } = await supabase.auth.updateUser({ password });
    if (error || !userId) {
      setSaving(false);
      setFormError(error?.message ?? "Không đổi được mật khẩu. Vui lòng thử lại.");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
      .eq("id", userId);
    if (profileError) {
      setSaving(false);
      setFormError("Đã đổi mật khẩu nhưng chưa gỡ được yêu cầu bắt buộc. Vui lòng thử lại.");
      return;
    }

    // Audit log: chỉ ghi sự kiện, không lưu giá trị mật khẩu.
    await supabase
      .from("audit_logs")
      .insert({ user_id: userId, action: "password.first_change", metadata: {} });

    setSaving(false);
    cenToast.success("Đã đổi mật khẩu. Chào mừng bạn đến với CEN WORK.");
    await navigate({ to: "/", replace: true });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-card border border-border-default bg-background-elevated p-5 shadow-level-2">
          <h1 className="text-h3 text-text-primary">Đổi mật khẩu bắt buộc</h1>
          <p className="mt-1 text-helper text-text-muted">
            Tài khoản đang dùng mật khẩu tạm thời. Vui lòng đặt mật khẩu mới để tiếp tục.
          </p>

          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <FormField
              id="new-password"
              label="Mật khẩu mới"
              required
              helperText="Tối thiểu 8 ký tự, gồm cả chữ và số."
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
              id="confirm-new-password"
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

            <Button type="submit" fullWidth loading={saving}>
              Đổi mật khẩu và tiếp tục
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
