import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, KeyRound, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormModal } from "@/components/ui/form-modal";
import { cenToast } from "@/components/ui/toast";
import { issueTemporaryPassword } from "@/lib/org.functions";
import type { MemberRow } from "@/lib/org-data";

/**
 * MEMBER-AUTH — Modal cấp mật khẩu tạm (Admin/CMO).
 * Mật khẩu chỉ hiển thị một lần trong phiên modal này; đóng modal là mất.
 */
export function TempPasswordModal({
  member,
  open,
  onOpenChange,
  onIssued,
}: {
  member: MemberRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued?: () => void;
}) {
  const [password, setPassword] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setPassword(null);
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (userId: string) => issueTemporaryPassword({ data: { userId } }),
    onSuccess: (result) => {
      setPassword(result.password);
      setError(null);
      onIssued?.();
    },
    onError: (err: Error) => setError(err.message || "Không cấp được mật khẩu tạm."),
  });

  async function copyPassword() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      cenToast.success("Đã sao chép mật khẩu tạm.");
    } catch {
      cenToast.error("Trình duyệt không cho phép sao chép. Vui lòng chọn và copy thủ công.");
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Cấp mật khẩu tạm"
      description={
        password
          ? "Mật khẩu chỉ hiển thị một lần. Hãy sao chép trước khi đóng."
          : "Tạo mật khẩu tạm cho tài khoản Leader hoặc Member."
      }
      busy={mutation.isPending}
      footer={
        password ? (
          <Button type="button" onClick={() => onOpenChange(false)}>
            Đã lưu, đóng lại
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              loading={mutation.isPending}
              disabled={!member}
              onClick={() => member && mutation.mutate(member.id)}
            >
              <KeyRound /> Tạo mật khẩu tạm
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-control border border-border-default bg-surface-subtle px-3 py-2">
          <p className="text-body text-text-primary">{member?.display_name ?? "—"}</p>
          <p className="text-helper text-text-muted">{member?.email ?? "—"}</p>
        </div>

        {!password ? (
          <p className="flex gap-2 rounded-control border border-state-warning/50 bg-state-warning-surface px-3 py-2 text-helper text-state-warning">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Mật khẩu hiện tại của tài khoản sẽ không còn sử dụng được. Người dùng bắt buộc đổi
              mật khẩu ngay ở lần đăng nhập kế tiếp.
            </span>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <code
                className="min-w-0 flex-1 truncate rounded-control border border-border-default bg-background-elevated px-3 py-2 font-mono text-body text-text-primary"
                data-testid="temp-password-value"
              >
                {password}
              </code>
              <Button type="button" variant="secondary" onClick={copyPassword}>
                <Copy /> Sao chép
              </Button>
            </div>
            <p className="flex gap-2 rounded-control border border-state-warning/50 bg-state-warning-surface px-3 py-2 text-helper text-state-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Chỉ gửi mật khẩu này cho đúng nhân sự được cấp, qua kênh riêng tư. Sau khi đóng
                modal, hệ thống không thể hiển thị lại.
              </span>
            </p>
          </div>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-control border border-state-danger/50 bg-state-danger-surface px-3 py-2 text-helper text-state-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </FormModal>
  );
}
