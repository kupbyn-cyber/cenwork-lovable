import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SkeletonText } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cenToast } from "@/components/ui/toast";
import {
  DAILY_REPORT_DEFAULTS,
  DAILY_REPORT_TIMEZONE,
  isValidEmail,
  isValidSendTime,
} from "@/lib/daily-report-settings";
import {
  getDailyReportSettings,
  saveDailyReportSettings,
  sendDailyReportTest,
} from "@/lib/daily-report-settings.functions";

/**
 * TASK-DAILY-01B — Khu cấu hình "Báo cáo công việc hằng ngày" trong /settings.
 * Chỉ lưu cấu hình và gửi thử; không có scheduler trong package này.
 */
export function DailyReportSection() {
  const queryClient = useQueryClient();
  const loadSettings = useServerFn(getDailyReportSettings);
  const saveSettings = useServerFn(saveDailyReportSettings);
  const sendTest = useServerFn(sendDailyReportTest);

  const result = useQuery({
    queryKey: ["daily-report-settings"],
    queryFn: () => loadSettings(),
  });

  const [enabled, setEnabled] = React.useState(DAILY_REPORT_DEFAULTS.enabled);
  const [email, setEmail] = React.useState("");
  const [sendTime, setSendTime] = React.useState(DAILY_REPORT_DEFAULTS.send_time);
  const [errors, setErrors] = React.useState<{ email?: string; time?: string }>({});
  const [sendResult, setSendResult] = React.useState<
    { ok: true; text: string } | { ok: false; text: string } | null
  >(null);

  const loaded = result.data;
  React.useEffect(() => {
    if (!loaded) return;
    setEnabled(loaded.enabled);
    setEmail(loaded.recipient_email ?? "");
    setSendTime(loaded.send_time);
  }, [loaded]);

  const saveMutation = useMutation({
    mutationFn: (input: { enabled: boolean; recipient_email: string | null; send_time: string }) =>
      saveSettings({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["daily-report-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      cenToast.success("Đã lưu cấu hình báo cáo hằng ngày.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: () => sendTest(),
    onSuccess: (data) => {
      setSendResult({
        ok: true,
        text: `Đã gửi ${data.fileName} (${data.rowCount} công việc) tới ${data.recipient}.`,
      });
      cenToast.success("Đã gửi thử báo cáo.");
    },
    onError: (error: Error) => {
      setSendResult({ ok: false, text: error.message });
      cenToast.error("Gửi thử báo cáo thất bại.");
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { email?: string; time?: string } = {};
    const trimmed = email.trim();
    if (!isValidSendTime(sendTime)) nextErrors.time = "Giờ gửi phải theo định dạng HH:mm.";
    if (trimmed && !isValidEmail(trimmed)) nextErrors.email = "Email không đúng định dạng.";
    else if (enabled && !isValidEmail(trimmed))
      nextErrors.email = "Cần email hợp lệ khi bật gửi tự động.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    saveMutation.mutate({
      enabled,
      recipient_email: trimmed || null,
      send_time: sendTime.trim(),
    });
  }

  if (result.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <SkeletonText lines={4} />
        </CardContent>
      </Card>
    );
  }

  if (result.error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <ErrorState
            title="Không tải được cấu hình báo cáo hằng ngày"
            onRetry={() => void result.refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  const smtpConfigured = result.data?.smtpConfigured ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Báo cáo công việc hằng ngày</CardTitle>
          <CardDescription>
            Cấu hình email nhận file Excel công việc. Việc gửi tự động hằng ngày sẽ bật ở bước sau.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="flex min-w-0 flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border-subtle px-3 py-3">
            <div className="min-w-0">
              <p className="text-label font-semibold text-text-primary">
                Tự động gửi báo cáo mỗi ngày
              </p>
              <p className="text-helper text-text-muted">
                Bật để lưu ý định gửi tự động; lịch chạy triển khai ở bước kế tiếp.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={saveMutation.isPending}
              aria-label="Tự động gửi báo cáo mỗi ngày"
            />
          </div>

          <FormField
            id="daily-report-email"
            label="Email nhận báo cáo"
            required={enabled}
            helperText="Một địa chỉ nhận file báo cáo."
            {...(errors.email ? { error: errors.email } : {})}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                type="email"
                inputMode="email"
                autoComplete="email"
                className="w-full"
                value={email}
                disabled={saveMutation.isPending}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FormField>

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <FormField
              id="daily-report-time"
              label="Giờ gửi"
              helperText="Định dạng HH:mm (00:00–23:59)."
              {...(errors.time ? { error: errors.time } : {})}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="time"
                  value={sendTime}
                  disabled={saveMutation.isPending}
                  onChange={(event) => setSendTime(event.target.value)}
                />
              )}
            </FormField>

            <FormField id="daily-report-tz" label="Múi giờ" helperText="Không thể thay đổi.">
              {(controlProps) => <Input {...controlProps} value={DAILY_REPORT_TIMEZONE} readOnly />}
            </FormField>
          </div>

          {!smtpConfigured ? (
            <p className="rounded-control border border-state-warning/50 bg-state-warning-surface px-3 py-2 text-helper text-state-warning">
              Máy chủ chưa cấu hình dịch vụ email nên chưa gửi thử được.
            </p>
          ) : null}

          {sendResult ? (
            <p
              role="status"
              className={
                sendResult.ok
                  ? "rounded-control border border-state-success/50 bg-state-success-surface px-3 py-2 text-helper text-state-success"
                  : "rounded-control border border-state-danger/50 bg-state-danger-surface px-3 py-2 text-helper text-state-danger"
              }
            >
              {sendResult.text}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="submit" loading={saveMutation.isPending}>
              Lưu cấu hình
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={testMutation.isPending}
              disabled={saveMutation.isPending || !smtpConfigured}
              onClick={() => {
                setSendResult(null);
                testMutation.mutate();
              }}
            >
              Gửi thử báo cáo
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
