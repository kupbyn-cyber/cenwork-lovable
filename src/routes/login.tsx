import * as React from "react";
import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FormField } from "@/components/ui/form-field";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

/** Chỉ chấp nhận đường dẫn nội bộ, tránh open redirect. */
function safeRedirect(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw redirect({ to: safeRedirect(search.redirect) });
    }
  },
  head: () => ({
    meta: [
      { title: "Đăng nhập — CEN WORK" },
      { name: "description", content: "Đăng nhập vào CEN WORK Marketing Command Center bằng email nội bộ." },
      { property: "og:title", content: "Đăng nhập — CEN WORK" },
      {
        property: "og:description",
        content: "Đăng nhập vào CEN WORK Marketing Command Center bằng email nội bộ.",
      },
    ],
  }),
  component: LoginPage,
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBER_KEY = "cen.login.remember";

function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(false);
  const [showForgot, setShowForgot] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [succeeded, setSucceeded] = React.useState(false);


  // Ghi nhớ đăng nhập: chỉ lưu email ở trình duyệt, không lưu mật khẩu.
  React.useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = "Vui lòng nhập email.";
    else if (!emailPattern.test(email.trim())) nextErrors.email = "Email không đúng định dạng.";
    if (!password) nextErrors.password = "Vui lòng nhập mật khẩu.";

    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setSubmitting(false);
      setSucceeded(false);
      setFormError("Email hoặc mật khẩu không đúng.");
      return;
    }

    if (remember) window.localStorage.setItem(REMEMBER_KEY, email.trim());
    else window.localStorage.removeItem(REMEMBER_KEY);

    // Chỉ khi thành công: loading đổi thành dấu tích ngắn rồi mới chuyển trang.
    setSucceeded(true);
    await new Promise((resolve) => setTimeout(resolve, 550));
    await navigate({ to: safeRedirect(search.redirect), replace: true });
  }


  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Vùng thương hiệu: gradient + glow trôi rất chậm, không phủ lên form */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="cen-anim-aurora cen-hairlines absolute -inset-[6%]"
          style={{
            background:
              "radial-gradient(70% 55% at 50% -5%, oklch(0.30 0.045 160 / 85%), transparent 70%), radial-gradient(45% 40% at 88% 100%, oklch(0.7101 0.1541 53.2 / 8%), transparent 70%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-[26rem]">
        <div className="cen-brand-glow flex flex-col items-center text-center">
          <img
            src="/brand/logo-mark.svg"
            alt="Logo CEN WORK"
            className="cen-anim-logo size-16 shrink-0 object-contain drop-shadow-[0_6px_24px_oklch(0.7101_0.1541_53.2/25%)]"
          />
          <h1
            className="cen-anim-rise mt-3 text-h2 font-bold tracking-[0.18em] text-text-primary uppercase"
            style={{ animationDelay: "140ms" }}
          >
            CEN WORK
          </h1>
          <p
            className="cen-anim-rise mt-1 text-helper tracking-[0.24em] text-accent-yellow/80 uppercase"
            style={{ animationDelay: "200ms" }}
          >
            Marketing Command Center
          </p>
        </div>


        <div
          className="cen-anim-rise mt-7 rounded-container border border-border-default/80 bg-background-elevated/85 p-6 shadow-level-3 backdrop-blur-xl"
          style={{ animationDelay: "260ms" }}
        >
          <h2 className="text-h4 text-text-primary">Đăng nhập</h2>
          <p className="mt-1 text-helper text-text-muted">
            Sử dụng tài khoản nội bộ đã được cấp để truy cập hệ thống.
          </p>

          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <FormField id="login-email" label="Email" required {...(errors.email ? { error: errors.email } : {})}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="ten@congty.vn"
                  value={email}
                  disabled={submitting}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </FormField>

            <FormField
              id="login-password"
              label="Mật khẩu"
              required
              {...(errors.password ? { error: errors.password } : {})}
            >
              {(controlProps) => (
                <PasswordInput
                  {...controlProps}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  disabled={submitting}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </FormField>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-label text-text-secondary">
                <Checkbox
                  checked={remember}
                  disabled={submitting}
                  onCheckedChange={(value) => setRemember(value === true)}
                />
                Ghi nhớ đăng nhập
              </label>
              <button
                type="button"
                className="cen-transition text-label text-accent-orange hover:text-accent-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                onClick={() => setShowForgot((v) => !v)}
              >
                Quên mật khẩu?
              </button>
            </div>

            {showForgot ? (
              <p className="rounded-control border border-border-default bg-surface-subtle px-3 py-2 text-helper text-text-secondary">
                Mật khẩu do quản trị hệ thống cấp lại. Vui lòng liên hệ Admin hoặc CMO để được đặt
                lại mật khẩu.
              </p>
            ) : null}

            {formError ? (
              <p
                role="alert"
                className="rounded-control border border-state-danger/50 bg-state-danger-surface px-3 py-2 text-helper text-state-danger"
              >
                {formError}
              </p>
            ) : null}

            <Button
              type="submit"
              fullWidth
              loading={submitting && !succeeded}
              disabled={succeeded}
              className="cen-transition cen-dur-1 transform-gpu hover:brightness-110 active:scale-[0.98]"
            >
              {succeeded ? (
                <>
                  <Check className="animate-in zoom-in-50 duration-200" aria-hidden />
                  Đã xác thực
                </>
              ) : (
                "Đăng nhập"
              )}
            </Button>

          </form>
        </div>

        <p className="mt-4 text-center text-caption text-text-muted">
          Tài khoản do quản trị hệ thống cấp. Hệ thống không hỗ trợ tự đăng ký.
        </p>
        <p className="mt-2 text-center text-caption text-text-muted">
          © 2026 CEN WORK · Product Owner: Đức Bùi — CMO
        </p>
      </div>
    </main>
  );
}

