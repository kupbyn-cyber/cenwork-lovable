import * as React from "react";
import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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
      { title: "Đăng nhập — CEN 1.0" },
      { name: "description", content: "Đăng nhập vào CEN 1.0 Command Center bằng email nội bộ." },
      { property: "og:title", content: "Đăng nhập — CEN 1.0" },
      {
        property: "og:description",
        content: "Đăng nhập vào CEN 1.0 Command Center bằng email nội bộ.",
      },
    ],
  }),
  component: LoginPage,
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

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
      setFormError("Email hoặc mật khẩu không đúng.");
      return;
    }

    await navigate({ to: safeRedirect(search.redirect), replace: true });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <img
            src="/brand/logo-mark.svg"
            alt=""
            aria-hidden
            className="size-9 shrink-0 object-contain"
          />
          <span className="min-w-0">
            <span className="block text-label font-bold tracking-wide text-text-primary">
              CEN 1.0
            </span>
            <span className="block text-caption text-text-muted">Trung tâm điều hành</span>
          </span>
        </div>

        <div className="mt-5 rounded-card border border-border-default bg-background-elevated p-5 shadow-level-2">
          <h1 className="text-h3 text-text-primary">Đăng nhập</h1>
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

            {formError ? (
              <p
                role="alert"
                className="rounded-control border border-state-danger/50 bg-state-danger-surface px-3 py-2 text-helper text-state-danger"
              >
                {formError}
              </p>
            ) : null}

            <Button type="submit" fullWidth loading={submitting}>
              Đăng nhập
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-caption text-text-muted">
          Tài khoản do quản trị hệ thống cấp. Hệ thống không hỗ trợ tự đăng ký.
        </p>
      </div>
    </main>
  );
}
