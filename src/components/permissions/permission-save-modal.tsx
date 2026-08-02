import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormModal } from "@/components/ui/form-modal";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SCOPE_LABEL, type DataScope, type PermissionChange } from "@/lib/permission-data";
import { ROLE_LABEL } from "@/lib/org-data";
import type { AppRoleKey } from "@/lib/permissions";

/**
 * ROLE-01 — hộp thoại xác nhận lưu phân quyền.
 * Bắt buộc: hiển thị diff, cảnh báo quyền nhạy cảm, số đối tượng bị ảnh hưởng và lý do.
 */
export interface DiffLine {
  key: string;
  label: string;
  target: string;
  before: string;
  after: string;
  sensitive: boolean;
}

export function PermissionSaveModal({
  open,
  onOpenChange,
  diff,
  changes,
  busy,
  onConfirm,
  title = "Xác nhận thay đổi phân quyền",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: DiffLine[];
  changes: PermissionChange[];
  busy: boolean;
  onConfirm: (reason: string) => void;
  title?: string;
}) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const sensitiveCount = diff.filter((line) => line.sensitive).length;
  const affected = new Set(diff.map((line) => line.target)).size;
  const reasonValid = reason.trim().length >= 5;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={`${changes.length} thay đổi · ${affected} đối tượng bị ảnh hưởng`}
      busy={busy}
      dirty={reason.length > 0}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Hủy
          </Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={busy || !reasonValid}>
            {busy ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {sensitiveCount > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-state-warning/40 bg-state-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-warning" />
            <span>
              Có {sensitiveCount} quyền nhạy cảm trong đợt thay đổi này. Hãy kiểm tra kỹ trước khi lưu.
            </span>
          </div>
        ) : null}

        <div className="max-h-[320px] overflow-y-auto rounded-md border border-border">
          <ul className="divide-y divide-border text-sm">
            {diff.map((line) => (
              <li key={line.key} className="flex flex-col gap-1 p-3">
                <span className="font-medium">{line.label}</span>
                <span className="text-text-muted">{line.target}</span>
                <span className="font-mono text-xs">
                  <span className="text-state-danger">{line.before}</span>
                  {" → "}
                  <span className="text-state-success">{line.after}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="permission-reason">Lý do thay đổi *</Label>
          <Textarea
            id="permission-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ví dụ: Mở phạm vi xem công việc toàn hệ thống cho CMO theo yêu cầu ban giám đốc."
            rows={3}
          />
          {!reasonValid ? (
            <span className="text-xs text-text-muted">Lý do tối thiểu 5 ký tự.</span>
          ) : null}
        </div>
      </div>
    </FormModal>
  );
}

export function describeState(enabled: boolean, scope: string | null): string {
  if (!enabled) return "Không cho phép";
  const label = scope ? (SCOPE_LABEL[scope as DataScope] ?? scope) : "—";
  return `Cho phép · ${label}`;
}

export function roleName(role: AppRoleKey): string {
  return ROLE_LABEL[role];
}
