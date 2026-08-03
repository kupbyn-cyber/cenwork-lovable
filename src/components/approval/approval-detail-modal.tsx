import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { ApprovalActions } from "@/components/approval/approval-actions";
import { ApprovalApproverList } from "@/components/approval/approval-approver-list";
import { ApprovalCommentThread } from "@/components/approval/approval-comment-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/hooks/use-auth";
import { useOrgAccess } from "@/hooks/use-org-access";
import {
  APPROVAL_MODE_LABEL,
  APPROVAL_STATUS_LABEL,
  APPROVAL_STATUS_TONE,
  approvalDetailQuery,
  DECISION_STATUS_LABEL,
  effectiveStatus,
} from "@/lib/approval-data";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * ANN-UI-10 — modal chi tiết yêu cầu phê duyệt.
 * Dùng lại nguyên các component nghiệp vụ của trang chi tiết, chỉ đổi khung hiển thị.
 */
interface Props {
  approvalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApprovalDetailModal({ approvalId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { isAdmin, isCmo } = useOrgAccess();
  const [showComments, setShowComments] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setShowComments(false);
      setShowHistory(false);
    }
  }, [open, approvalId]);

  const detail = useQuery({
    ...approvalDetailQuery(approvalId ?? ""),
    enabled: open && Boolean(approvalId),
  });

  const data = detail.data ?? null;
  const request = data?.request ?? null;
  const nameById = new Map((data?.participants ?? []).map((item) => [item.id, item.display_name]));
  const senderName = request ? (nameById.get(request.sender_id) ?? "—") : "—";
  const status = request ? effectiveStatus(request) : null;
  const isSender = request?.sender_id === user?.id;
  const isApprover = (data?.decisions ?? []).some((item) => item.approver_id === user?.id);
  const myDecision = (data?.decisions ?? []).find(
    (item) =>
      request &&
      item.version_no === request.current_version &&
      item.approver_id === user?.id &&
      item.decision_status !== "replaced",
  );
  const historyVersions = (data?.versions ?? []).filter(
    (item) => request && item.version_no !== request.current_version,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-[860px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="min-w-0 gap-2 border-b border-border-default p-4 pe-12 sm:p-5 sm:pe-12">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge size="sm" variant="outline">
              Phê duyệt
            </Badge>
            {status ? (
              <StatusBadge
                tone={APPROVAL_STATUS_TONE[status]}
                label={APPROVAL_STATUS_LABEL[status]}
              />
            ) : null}
            {request ? (
              <StatusBadge tone="neutral" label={`Phiên bản V${request.current_version}`} />
            ) : null}
          </div>
          <DialogTitle className="min-w-0 break-words text-body-lg">
            {request?.title ?? "Yêu cầu phê duyệt"}
          </DialogTitle>
          <DialogDescription className="min-w-0 break-words">
            {request
              ? `Người gửi: ${senderName} · Hạn xử lý: ${formatHanoiDateTime(request.due_at)}`
              : "Đang tải nội dung yêu cầu…"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
          {detail.isLoading ? <SkeletonCard lines={5} /> : null}
          {detail.isError ? (
            <ErrorState
              title="Không tải được yêu cầu"
              description="Thử lại để xem nội dung yêu cầu phê duyệt."
              onRetry={() => void detail.refetch()}
            />
          ) : null}

          {data && request ? (
            <>
              <div className="min-w-0 rounded-control border border-border-strong bg-surface-subtle p-3">
                <p className="text-helper font-medium uppercase tracking-wide text-text-muted">
                  Nội dung cần quyết định
                </p>
                <LinkifiedText
                  as="div"
                  className="mt-2 text-body text-text-primary"
                  text={request.content}
                  fallback={<div className="mt-2 text-body text-text-muted">(Không có nội dung)</div>}
                />
                <p className="mt-2 text-helper text-text-muted">
                  Cơ chế: {APPROVAL_MODE_LABEL[request.approval_mode]}
                </p>
              </div>

              <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-helper text-text-muted">Người gửi</dt>
                  <dd className="break-words text-label text-text-primary">{senderName}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-helper text-text-muted">Thời gian gửi</dt>
                  <dd className="text-label text-text-primary">
                    {formatHanoiDateTime(request.created_at)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-helper text-text-muted">Thời gian xử lý</dt>
                  <dd className="text-label text-text-primary">
                    {myDecision?.decision_at
                      ? formatHanoiDateTime(myDecision.decision_at)
                      : request.approved_at || request.rejected_at || request.withdrawn_at
                        ? formatHanoiDateTime(
                            (request.approved_at ??
                              request.rejected_at ??
                              request.withdrawn_at) as string,
                          )
                        : "Chưa xử lý"}
                  </dd>
                </div>
              </dl>

              <div className="flex min-w-0 flex-col gap-2">
                <SectionHeader
                  title="Người phê duyệt"
                  description="Kết quả xử lý của phiên bản hiện tại."
                />
                <ApprovalApproverList detail={data} userId={user?.id ?? null} />
              </div>

              <div className="min-w-0 border-t border-border-default pt-3">
                {showComments ? (
                  <div className="flex max-h-[38vh] min-w-0 flex-col gap-3 overflow-y-auto">
                    <ApprovalCommentThread
                      detail={data}
                      canMention={Boolean(isSender || isApprover)}
                      canModerate={Boolean(isAdmin || isCmo)}
                    />
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowComments(true)}
                  >
                    Xem trao đổi
                  </Button>
                )}
              </div>

              {historyVersions.length > 0 ? (
                <div className="min-w-0 border-t border-border-default pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowHistory((prev) => !prev)}
                  >
                    {showHistory ? "Ẩn lịch sử phiên bản" : `Lịch sử phiên bản (${historyVersions.length})`}
                  </Button>
                  {showHistory ? (
                    <div className="mt-3 flex min-w-0 flex-col gap-2">
                      {historyVersions.map((version) => (
                        <div
                          key={version.id}
                          className="flex min-w-0 flex-col gap-1 rounded-control border border-border-default p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="min-w-0 break-words text-label font-medium text-text-primary">
                              V{version.version_no} — {version.title}
                            </p>
                            {version.outcome_status ? (
                              <StatusBadge
                                tone={APPROVAL_STATUS_TONE[version.outcome_status]}
                                label={APPROVAL_STATUS_LABEL[version.outcome_status]}
                              />
                            ) : null}
                          </div>
                          <p className="text-helper text-text-muted">
                            Gửi lúc {formatHanoiDateTime(version.submitted_at)}
                          </p>
                          <ul className="flex min-w-0 flex-col gap-1">
                            {data.decisions
                              .filter((item) => item.version_no === version.version_no)
                              .map((item) => (
                                <li
                                  key={item.id}
                                  className="break-words text-helper text-text-muted"
                                >
                                  {nameById.get(item.approver_id) ?? "Người dùng"} —{" "}
                                  {DECISION_STATUS_LABEL[item.decision_status]}
                                </li>
                              ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border-default bg-surface-base p-4 sm:p-5">
          {approvalId ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/approvals/$approvalId" params={{ approvalId }}>
                <ExternalLink />
                Trang đầy đủ
              </Link>
            </Button>
          ) : null}
          <div className="ms-auto flex min-w-0 flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            {data ? <ApprovalActions detail={data} userId={user?.id ?? null} /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
