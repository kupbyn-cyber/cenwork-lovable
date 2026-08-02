import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormModal } from "@/components/ui/form-modal";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/datetime";
import { permissionChangeSetsQuery, revertChangeSet } from "@/lib/permission-data";

const KIND_LABEL: Record<string, string> = {
  update: "Cập nhật",
  revert: "Hoàn tác",
  restore_defaults: "Khôi phục mặc định",
  clear_overrides: "Xóa ngoại lệ",
};

/** ROLE-01 — lịch sử change set và hoàn tác. */
export function PermissionHistoryPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const history = useQuery(permissionChangeSetsQuery());
  const [target, setTarget] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const mutation = useMutation({
    mutationFn: (input: { id: string; reason: string }) => revertChangeSet(input.id, input.reason),
    onSuccess: () => {
      cenToast.success("Đã hoàn tác thay đổi phân quyền.");
      setTarget(null);
      setReason("");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const rows = history.data ?? [];
  if (!history.isLoading && rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Chưa có thay đổi phân quyền"
        description="Mọi thay đổi sẽ được ghi lại kèm lý do và ảnh chụp cấu hình."
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral" size="sm">
                {KIND_LABEL[row.kind] ?? row.kind}
              </Badge>
              <span className="text-xs text-text-muted">{formatDateTime(row.created_at)}</span>
              {row.reverted_at ? (
                <Badge variant="warning" size="sm">
                  Đã hoàn tác
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 break-words text-sm">{row.reason}</p>
          </div>
          {canManage && !row.reverted_at ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTarget(row.id)}
              disabled={mutation.isPending}
            >
              <Undo2 className="size-4" /> Hoàn tác
            </Button>
          ) : null}
        </div>
      ))}

      <FormModal
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title="Hoàn tác thay đổi phân quyền"
        description="Cấu hình sẽ quay lại ảnh chụp trước thay đổi này. Lịch sử cũ vẫn được giữ."
        size="md"
        busy={mutation.isPending}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={mutation.isPending}>
              Hủy
            </Button>
            <Button
              disabled={mutation.isPending || reason.trim().length < 5}
              onClick={() => target && mutation.mutate({ id: target, reason: reason.trim() })}
            >
              Hoàn tác
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revert-reason">Lý do hoàn tác *</Label>
          <Textarea
            id="revert-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </FormModal>
    </div>
  );
}
