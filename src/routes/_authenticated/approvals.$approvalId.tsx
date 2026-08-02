import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { ApprovalActions } from "@/components/approval/approval-actions";
import { ApprovalApproverList } from "@/components/approval/approval-approver-list";
import { ApprovalCommentThread } from "@/components/approval/approval-comment-thread";
import { ApprovalAttachments } from "@/components/attachment/module-attachments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
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
} from "@/lib/approval-data";
import { formatHanoiDateTime } from "@/lib/datetime";


const TITLE = "Chi tiết yêu cầu phê duyệt — CEN WORK";
const DESCRIPTION = "Xem tiến độ, quyết định và lịch sử phiên bản của yêu cầu phê duyệt.";

export const Route = createFileRoute("/_authenticated/approvals/$approvalId")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApprovalDetailPage,
});

function ApprovalDetailPage() {
  const { approvalId } = Route.useParams();
  const { user } = useAuth();
  const { isAdmin, isCmo } = useOrgAccess();
  const detail = useQuery(approvalDetailQuery(approvalId));


  const back = (
    <Button asChild variant="secondary" size="sm">
      <Link to="/approvals">
        <ArrowLeft />
        Danh sách
      </Link>
    </Button>
  );

  if (detail.isLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="Yêu cầu phê duyệt" actions={back} />
        <Card>
          <CardContent>
            <SkeletonCard lines={5} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (detail.isError) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="Yêu cầu phê duyệt" actions={back} />
        <Card>
          <CardContent>
            <ErrorState
              title="Không tải được yêu cầu"
              description="Thử lại hoặc quay về danh sách phê duyệt."
              onRetry={() => void detail.refetch()}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="Yêu cầu phê duyệt" actions={back} />
        <Card>
          <CardContent>
            <EmptyState
              title="Không tìm thấy yêu cầu"
              description="Yêu cầu không tồn tại hoặc bạn không có quyền xem nội dung này."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { request, versions, decisions, participants } = detail.data;
  const nameById = new Map(participants.map((item) => [item.id, item.display_name]));
  const senderName = nameById.get(request.sender_id) ?? "—";
  const historyVersions = versions.filter((item) => item.version_no !== request.current_version);
  const isSender = request.sender_id === user?.id;
  const isApprover = decisions.some((item) => item.approver_id === user?.id);
  const canMention = isSender || isApprover;


  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={request.title} description={`Người gửi: ${senderName}`} actions={back}>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            tone={APPROVAL_STATUS_TONE[request.status]}
            label={APPROVAL_STATUS_LABEL[request.status]}
          />
          <StatusBadge tone="neutral" label={APPROVAL_MODE_LABEL[request.approval_mode]} />
          <StatusBadge tone="neutral" label={`Phiên bản V${request.current_version}`} />
        </div>
      </PageHeader>

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-helper text-text-muted">Ngày tạo</dt>
              <dd className="text-label text-text-primary">
                {formatHanoiDateTime(request.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-helper text-text-muted">Hạn xử lý</dt>
              <dd className="text-label text-text-primary">
                {formatHanoiDateTime(request.due_at)}
              </dd>
            </div>
            <div>
              <dt className="text-helper text-text-muted">Cơ chế</dt>
              <dd className="text-label text-text-primary">
                {APPROVAL_MODE_LABEL[request.approval_mode]}
              </dd>
            </div>
          </dl>
          <div className="whitespace-pre-wrap break-words text-body text-text-secondary">
            {request.content || "(Không có nội dung)"}
          </div>
          <ApprovalActions detail={detail.data} userId={user?.id ?? null} sticky />
        </CardContent>
      </Card>

      <Card>
      <Card>
        <CardContent className="flex min-w-0 flex-col gap-3">
          <SectionHeader
            title="Người phê duyệt"
            description="Kết quả xử lý của phiên bản hiện tại."
          />
          <ApprovalApproverList detail={detail.data} userId={user?.id ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-3">
          <SectionHeader
            title="Tệp đính kèm"
            description="Chỉ người gửi thêm hoặc gỡ tệp; tệp của phiên bản cũ vẫn được giữ lại."
          />
          <ApprovalAttachments
            requestId={request.id}
            currentVersion={request.current_version}
            canManage={isSender}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-3">
          <SectionHeader
            title="Trao đổi"
            description="Chỉ người liên quan tới yêu cầu này xem được. Nhắc tên chỉ mở quyền xem và bình luận."
          />
          <ApprovalCommentThread
            detail={detail.data}
            canMention={canMention}
            canModerate={Boolean(isAdmin || isCmo)}
          />
        </CardContent>
      </Card>



      <Card>
        <CardContent className="flex min-w-0 flex-col gap-3">
          <SectionHeader
            title="Lịch sử phiên bản"
            description="Nội dung và kết quả của các phiên bản đã gửi."
          />
          {historyVersions.length === 0 ? (
            <p className="text-helper text-text-muted">Yêu cầu mới có phiên bản đầu tiên.</p>
          ) : (
            historyVersions.map((version) => {
              const versionDecisions = decisions.filter(
                (item) => item.version_no === version.version_no,
              );
              return (
                <div
                  key={version.id}
                  className="flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-label font-medium text-text-primary">
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
                    Gửi lúc {formatHanoiDateTime(version.submitted_at)} • Hạn{" "}
                    {formatHanoiDateTime(version.due_at)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-helper text-text-secondary">
                    {version.content}
                  </p>
                  <ul className="flex min-w-0 flex-col gap-1">
                    {versionDecisions.map((item) => (
                      <li key={item.id} className="break-words text-helper text-text-muted">
                        {nameById.get(item.approver_id) ?? "Người dùng"} —{" "}
                        {DECISION_STATUS_LABEL[item.decision_status]}
                        {item.rejection_reason ? `: ${item.rejection_reason}` : ""}
                        {item.approval_note ? `: ${item.approval_note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
