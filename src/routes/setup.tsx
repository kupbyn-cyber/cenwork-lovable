import * as React from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { LoadingBlock } from "@/components/ui/spinner";
import { getBootstrapStatus, createBootstrapAdmin } from "@/lib/bootstrap.functions";

/**
 * AUTH-PORTABLE-01 — Thiết lập quản trị đầu tiên.
 * Chỉ mở khi máy chủ báo setup_required = true; tự khóa sau khi có System Owner/Admin.
 */
export const Route = createFileRoute("/setup")({
  ssr: false,
  beforeLoad: async () => {
    const status = await getBootstrapStatus();
    if (!status.setup_required) throw redirect({ to: "/login", search: {} });
  },
  head: () => ({
    meta: [
      { title: "Thiết lập quản trị đầu tiên — CEN WORK" },
      {
        name: "description",
        content:
          "Khởi tạo tài khoản quản trị đầu tiên cho hệ thống CEN WORK khi triển khai môi trường mới.",
      },
      { property: "og:title", content: "Thiết lập quản trị đầu tiên — CEN WORK" },
      {
        property: "og:description",
        content:
          "Khởi tạo tài khoản quản trị đầu tiên cho hệ thống CEN WORK khi triển khai môi trường mới.",
      },
    ],
  }),
  pendingComponent: () => (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <LoadingBlock label="Đang kiểm tra trạng thái hệ thống" />
    </div>
  ),
  component: SetupPage,
});

function validatePassword(value: string): string | undefined {
  if (value.length < 8) return "Mật khẩu tối thiểu 8 ký tự.";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return "Mật khẩu phải gồm cả chữ và số.";
  return undefined;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = Partial<
  Record<"displayName" | "email" | "password" | "confirm" | "token", string>
>;

function SetupPage() {
  const navigate = useNavigate();
  const submitBootstrap = useServerFn(createBootstrapAdmin);

  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [token, setToken] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [succeeded, setSucceeded] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || succeeded) return;

    const next: FieldErrors = {};
    if (!displayName.trim()) next.displayName = "Vui lòng nhập họ tên.";
    if (!email.trim()) next.email = "Vui lòng nhập email.";
    else if (!emailPattern.test(email.trim())) next.email = "Email không đúng định dạng.";
    const passwordError = validatePassword(password);
    if (passwordError) next.password = passwordError;
    if (password !== confirm) next.confirm = "Hai mật khẩu chưa trùng nhau.";
    if (!token.trim()) next.token = "Vui lòng nhập mã thiết lập.";

    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await submitBootstrap({
        data: {
          displayName: displayName.trim(),
          email: email.trim(),
          password,
          token: token.trim(),
        },
      });
      setSucceeded(true);
      await new Promise((resolve) => setTimeout(resolve, 700));
      await navigate({ to: "/login", search: {}, replace: true });
    } catch (error) {
      setSubmitting(false);
      setFormError(
        error instanceof Error && error.message
          ? error.message
          : "Không hoàn tất được thiết lập. Vui lòng thử lại.",
      );
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -inset-[6%]"
          style={{
            background:
              "radial-gradient(70% 55% at 50% -5%, oklch(0.30 0.045 160 / 85%), transparent 70%), radial-gradient(45% 40% at 88% 100%, oklch(0.7101 0.1541 53.2 / 8%), transparent 70%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-[28rem]">
        <div className="flex flex-col items-center text-center">
          <img
            src="/brand/logo-mark.svg"
            alt="Logo CEN WORK"
            className="size-16 shrink-0 object-contain"
          />
          <h1 className="mt-3 text-h2 font-bold tracking-[0.18em] text-text-primary uppercase">
            CEN WORK
          </h1>
          <p className="mt-1 text-helper tracking-[0.24em] text-accent-yellow/80 uppercase">
            Marketing Command Center
          </p>
        </div>

        <div className="mt-7 rounded-container border border-border-default/80 bg-background-elevated/85 p-6 shadow-level-3">
          <h2 className="text-h4 text-text-primary">Thiết lập quản trị đầu tiên</h2>
          <p className="mt-1 text-helper text-text-muted">
            Bước này chỉ xuất hiện một lần khi hệ thống chưa có quản trị viên. Sau khi hoàn tất,
            trang này sẽ tự khóa.
          </p>

          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <FormField
              id="setup-name"
              label="Họ tên"
              required
              {...(errors.displayName ? { error: errors.displayName } : {})}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  autoComplete="name"
                  autoFocus
                  placeholder="Nguyễn Văn A"
                  value={displayName}
                  disabled={submitting || succeeded}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              )}
            </FormField>

            <FormField
              id="setup-email"
              label="Email"
              required
              {...(errors.email ? { error: errors.email } : {})}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="admin@congty.vn"
                  value={email}
                  disabled={submitting || succeeded}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </FormField>

            <FormField
              id="setup-password"
              label="Mật khẩu"
              required
              helperText="Tối thiểu 8 ký tự, gồm cả chữ và số."
              {...(errors.password ? { error: errors.password } : {})}
            >
              {(controlProps) => (
                <PasswordInput
                  {...controlProps}
                  autoComplete="new-password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  disabled={submitting || succeeded}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </FormField>

            <FormField
              id="setup-confirm"
              label="Xác nhận mật khẩu"
              required
              {...(errors.confirm ? { error: errors.confirm } : {})}
            >
              {(controlProps) => (
                <PasswordInput
                  {...controlProps}
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu"
                  value={confirm}
                  disabled={submitting || succeeded}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              )}
            </FormField>

            <FormField
              id="setup-token"
              label="Mã thiết lập"
              required
              helperText="Mã do quản trị hạ tầng cấu hình trên máy chủ."
              {...(errors.token ? { error: errors.token } : {})}
            >
              {(controlProps) => (
                <PasswordInput
                  {...controlProps}
                  autoComplete="off"
                  placeholder="Nhập mã thiết lập"
                  value={token}
                  disabled={submitting || succeeded}
                  onChange={(e) => setToken(e.target.value)}
                />
              )}
            </FormField>

            {formError ? (
              <p
                role="alert"
                className="rounded-control border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-helper text-status-danger"
              >
                {formError}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting || succeeded}>
              {succeeded ? (
                <>
                  <Check className="size-4" aria-hidden />
                  Đã tạo quản trị viên
                </>
              ) : submitting ? (
                "Đang thiết lập..."
              ) : (
                "Tạo quản trị viên"
              )}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
