import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { lockBlockersQuery, resetLockedIdentity } from "@/lib/member-identity";
import { lockMemberAccount } from "@/lib/org.functions";
import type { MemberRow } from "@/lib/org-data";

/**
 * MEMBER-LOCK-01 — hộp thoại khóa tài khoản.
 * Chỉ cho khóa khi không còn trách nhiệm đang hoạt động; danh sách trách nhiệm
 * hiển thị kèm liên kết điều hướng để Admin chuyển giao trước.
 */
export function MemberLockDialog({
  member,
  onOpenChange,
}: {
  member: MemberRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (member) setReason("");
  }, [member]);

  const blockers = useQuery(lockBlockersQuery(member?.id ?? null));
  const total = blockers.data?.total ?? 0;
  const blocked = blockers.isLoading || blockers.isError || total > 0;

  const lockMutation = useMutation({
    mutationFn: (input: { userId: string; reason: string }) => lockMemberAccount({ data: input }),
    onSuccess: () => {
      resetLockedIdentity();
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      cenToast.success("Đã khóa và chuyển tài khoản vào lưu trữ.");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["member-lock-blockers"] });
      cenToast.error(error.message);
    },
  });

  return (
    <ConfirmDialog
      open={member !== null}
      onOpenChange={onOpenChange}
      tone="destructive"
      title="Khóa tài khoản?"
      description={`${member?.display_name ?? ""} sẽ không thể đăng nhập, không nhận thông báo mới và chuyển vào mục Tài khoản lưu trữ. Dữ liệu lịch sử được giữ nguyên.`}
      confirmLabel="Khóa tài khoản"
      loading={lockMutation.isPending}
      confirmDisabled={blocked || reason.trim().length < 3}
      onConfirm={() => {
        if (!member) return;
        lockMutation.mutate({ userId: member.id, reason: reason.trim() });
      }}
    >
      <div className="flex flex-col gap-3 text-sm">
        {blockers.isLoading ? <p className="text-text-secondary">Đang kiểm tra trách nhiệm…</p> : null}
        {blockers.isError ? (
          <p className="text-state-danger">Không kiểm tra được trách nhiệm của tài khoản này.</p>
        ) : null}

        {total > 0 ? (
          <div className="rounded-md border border-state-danger/40 bg-state-danger-surface p-3">
            <p className="flex items-center gap-2 font-medium text-state-danger">
              <AlertTriangle className="size-4" aria-hidden /> Còn {total} trách nhiệm chưa chuyển
              giao
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {blockers.data?.teams.map((team) => (
                <li key={`team-${team.id}`}>
                  <Link
                    to="/organization"
                    className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    Leader của Team: {team.name} <ExternalLink className="size-3" aria-hidden />
                  </Link>
                </li>
              ))}
              {blockers.data?.projects.map((project) => (
                <li key={`project-${project.id}`}>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    Chủ dự án: {project.name} <ExternalLink className="size-3" aria-hidden />
                  </Link>
                </li>
              ))}
              {blockers.data?.tasks.map((task) => (
                <li key={`task-${task.id}`}>
                  <Link
                    to="/tasks/$taskId"
                    params={{ taskId: task.id }}
                    className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    Công việc chưa hoàn thành: {task.name}{" "}
                    <ExternalLink className="size-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-text-secondary">
              Chuyển giao hết các mục trên rồi mới khóa được tài khoản.
            </p>
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="font-medium">
            Lý do khóa <span className="text-state-danger">*</span>
          </span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ví dụ: Nhân sự đã nghỉ việc từ 01/08."
            rows={3}
            maxLength={500}
          />
        </label>
      </div>
    </ConfirmDialog>
  );
}
