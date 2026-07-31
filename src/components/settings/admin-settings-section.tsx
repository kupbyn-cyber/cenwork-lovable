import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SkeletonText } from "@/components/ui/skeleton";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import {
  SETTING_LABEL,
  appSettingsQuery,
  settingIsNumber,
  settingText,
  updateAppSetting,
  type AppSettingRow,
} from "@/lib/settings-data";

/**
 * CEN 1.0 — M1.5 khu vực quản trị hệ thống trong /settings.
 * Chỉ hiển thị các setting đã có dữ liệu trong app_settings.
 * Quyền sửa được chốt ở database (RLS chỉ cho Admin); UI chỉ disable.
 */
function SettingRowForm({ row, canEdit }: { row: AppSettingRow; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const isNumber = settingIsNumber(row);
  const initial = settingText(row);
  const [value, setValue] = React.useState(initial);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => setValue(initial), [initial]);

  const mutation = useMutation({
    mutationFn: (next: string) =>
      updateAppSetting(row.key, isNumber ? { number: Number(next) } : { text: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      cenToast.success("Đã lưu cấu hình hệ thống.");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = value.trim();
    if (!next) {
      setError("Vui lòng nhập giá trị.");
      return;
    }
    if (isNumber) {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1440) {
        setError("Giá trị phải là số từ 1 đến 1440.");
        return;
      }
    } else if (next.length > 120) {
      setError("Giá trị tối đa 120 ký tự.");
      return;
    }
    setError(undefined);
    mutation.mutate(next);
  }

  return (
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit} noValidate>
      <div className="min-w-0 flex-1">
        <FormField
          id={`setting-${row.key}`}
          label={SETTING_LABEL[row.key] ?? row.key}
          {...(row.description ? { helperText: row.description } : {})}
          {...(error ? { error } : {})}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={value}
              inputMode={isNumber ? "numeric" : "text"}
              disabled={!canEdit || mutation.isPending}
              readOnly={!canEdit}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </FormField>
      </div>
      {canEdit ? (
        <Button type="submit" loading={mutation.isPending} disabled={value.trim() === initial}>
          Lưu
        </Button>
      ) : null}
    </form>
  );
}

export function AdminSettingsSection() {
  const access = useOrgAccess();
  const result = useQuery(appSettingsQuery());

  if (access.loading) return <SkeletonText lines={3} />;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Quản trị hệ thống</CardTitle>
          <CardDescription>
            {access.canManageSettings
              ? "Các cấu hình dùng chung của CEN. Thay đổi được ghi vào nhật ký hoạt động."
              : "Bạn chỉ có quyền xem cấu hình hệ thống."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {result.isLoading ? (
          <SkeletonText lines={3} />
        ) : result.error ? (
          <ErrorState
            title="Không tải được cấu hình hệ thống"
            onRetry={() => void result.refetch()}
          />
        ) : (result.data ?? []).length === 0 ? (
          <EmptyState title="Chưa có cấu hình nào" />
        ) : (
          <div className="flex flex-col gap-5">
            {(result.data ?? []).map((row) => (
              <SettingRowForm key={row.key} row={row} canEdit={access.canManageSettings} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
