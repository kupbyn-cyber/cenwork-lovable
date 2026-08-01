import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { ReportSectionEditor } from "@/components/report/report-section-editor";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDateTime } from "@/lib/datetime";
import { REPORT_KIND_LABEL } from "@/lib/report-obligation-data";
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  REVIEW_ACTION_LABEL,
  decideReopen,
  reopenRequestsQuery,
  reportDocQuery,
  reportLinksQuery,
  reportReviewsQuery,
  reportSectionsQuery,
  reportSuggestionsQuery,
  reportVersionsQuery,
  requestReopen,
  reviewReport,
  submitReport,
  type ReportReviewAction,
} from "@/lib/report-workflow-data";

/**
 * CEN 1.0 — REPORT-02: màn hình xử lý một báo cáo.
 * Người gửi soạn và gửi; người kiểm tra phản hồi, yêu cầu bổ sung hoặc xác nhận.
 * Quyền và điều kiện chuyển trạng thái do database quyết định.
 */
export const Route = createFileRoute("/_authenticated/reports/doc/$reportId")({
  head: () => ({
    meta: [
      { title: "Xử lý báo cáo — CEN WORK" },
      {
        name: "description",
        content: "Soạn, gửi, phản hồi và xác nhận báo cáo theo kỳ; xem lịch sử phiên bản và nguồn tham chiếu.",
      },
      { property: "og:title", content: "Xử lý báo cáo — CEN WORK" },
      {
        property: "og:description",
        content: "Soạn, gửi, phản hồi và xác nhận báo cáo theo kỳ; xem lịch sử phiên bản và nguồn tham chiếu.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportDocPage,
});

const EDITABLE_STATUS = new Set(["draft", "revision_required", "reopened"]);

function ReportDocPage() {
  const { reportId } = Route.useParams();
  const access = useOrgAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const docResult = useQuery(reportDocQuery(reportId));
  const sectionsResult = useQuery(reportSectionsQuery(reportId));
  const linksResult = useQuery(reportLinksQuery(reportId));
  const reviewsResult = useQuery(reportReviewsQuery(reportId));
  const versionsResult = useQuery(reportVersionsQuery(reportId));
  const reopenResult = useQuery(reopenRequestsQuery(reportId));
  const suggestionsResult = useQuery(reportSuggestionsQuery(reportId));

  const [reviewNote, setReviewNote] = React.useState("");
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [reopenReason, setReopenReason] = React.useState("");
  const [reopenPlanned, setReopenPlanned] = React.useState("");

  const doc = docResult.data ?? null;

  const invalidate = () => {
    for (const key of [
      ["report-doc", reportId],
      ["report-sections", reportId],
      ["report-links", reportId],
      ["report-reviews", reportId],
      ["report-versions", reportId],
      ["report-reopen", reportId],
      ["report-docs"],
      ["report-obligations"],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const submit = useMutation({
    mutationFn: () => submitReport(reportId),
    onSuccess: (status) => {
      invalidate();
      cenToast.success(
        status === "pending_review" ? "Đã gửi, chờ người kiểm tra xác nhận" : "Đã gửi báo cáo",
      );
    },
    onError: (error: Error) => cenToast.error("Không gửi được", { description: error.message }),
  });

  const review = useMutation({
    mutationFn: (action: ReportReviewAction) => reviewReport(reportId, action, reviewNote.trim() || null),
    onSuccess: () => {
      setReviewNote("");
      invalidate();
      cenToast.success("Đã xử lý báo cáo");
    },
    onError: (error: Error) => cenToast.error("Không xử lý được", { description: error.message }),
  });

  const askReopen = useMutation({
    mutationFn: () => requestReopen(reportId, reopenReason.trim(), reopenPlanned.trim()),
    onSuccess: () => {
      setReopenOpen(false);
      setReopenReason("");
      setReopenPlanned("");
      invalidate();
      cenToast.success("Đã gửi yêu cầu mở lại");
    },
    onError: (error: Error) => cenToast.error("Không gửi được", { description: error.message }),
  });

  const archive = useMutation({
    mutationFn: () => setReportArchived(reportId, true, archiveReason.trim()),
    onSuccess: () => {
      setArchiveOpen(false);
      setArchiveReason("");
      invalidate();
      cenToast.success("Đã lưu trữ báo cáo");
    },
    onError: (error: Error) => cenToast.error("Không lưu trữ được", { description: error.message }),
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; approve: boolean }) =>
      decideReopen(input.id, input.approve, reviewNote.trim() || null),
    onSuccess: () => {
      setReviewNote("");
      invalidate();
      cenToast.success("Đã xử lý yêu cầu mở lại");
    },
    onError: (error: Error) => cenToast.error("Không xử lý được", { description: error.message }),
  });

  if (docResult.isLoading) return <SkeletonCard />;
  if (docResult.isError || !doc) {
    return (
      <ErrorState
        title="Không mở được báo cáo"
        description={(docResult.error as Error | null)?.message ?? "Bạn không có quyền xem báo cáo này."}
        onRetry={() => void docResult.refetch()}
      />
    );
  }

  const isAuthor = doc.author_id === access.userId;
  const editable = isAuthor && EDITABLE_STATUS.has(doc.status);
  const canReview =
    !isAuthor && (access.userId === doc.reviewer_id || access.isCmo || access.isAdmin);
  const awaitingReview = doc.status === "pending_review" || doc.status === "submitted";
  const pendingReopen = (reopenResult.data ?? []).find((row) => row.status === "pending") ?? null;
  const canDecideReopen =
    pendingReopen !== null && (access.userId === doc.confirmed_by || access.isCmo || access.isAdmin);

  return (
    <div className="grid gap-4">
      <PageHeader
        title={`${REPORT_KIND_LABEL[doc.report_type]} — ${doc.period_key}`}
        description={[
          doc.authorName ? `Người gửi ${doc.authorName}` : null,
          doc.projectName,
          doc.due_at ? `Hạn ${formatHanoiDateTime(doc.due_at)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/reports" })}>
            <ArrowLeft className="size-4" /> Danh sách báo cáo
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <StatusBadge label={DOC_STATUS_LABEL[doc.status]} tone={DOC_STATUS_TONE[doc.status]} />
            <span className="text-body-sm text-text-tertiary">
              Phiên bản {doc.current_version} · Lượt bổ sung {doc.revision_round}
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {editable ? (
              <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate()}>
                {doc.first_submitted_at ? "Gửi lại" : "Gửi báo cáo"}
              </Button>
            ) : null}
            {(access.isCmo || access.isAdmin) && (doc.status === "confirmed" || doc.status === "published") ? (
              <Button size="sm" variant="secondary" onClick={() => setArchiveOpen(true)}>
                Lưu trữ
              </Button>
            ) : null}
            {isAuthor && doc.status === "confirmed" && !pendingReopen ? (
              <Button size="sm" variant="secondary" onClick={() => setReopenOpen(true)}>
                Yêu cầu mở lại
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-body-sm text-text-secondary">
          <p>Người kiểm tra: {doc.reviewerName ?? "Chưa xác định"}</p>
          <p>
            Gửi lần đầu:{" "}
            {doc.first_submitted_at ? formatHanoiDateTime(doc.first_submitted_at) : "Chưa gửi"}
            {doc.last_submitted_at && doc.last_submitted_at !== doc.first_submitted_at
              ? ` · Gửi gần nhất ${formatHanoiDateTime(doc.last_submitted_at)}`
              : ""}
          </p>
          {doc.confirmed_at ? <p>Xác nhận lúc {formatHanoiDateTime(doc.confirmed_at)}</p> : null}
        </CardContent>
      </Card>

      {(sectionsResult.data ?? []).map((section) => (
        <ReportSectionEditor
          key={section.id}
          report={doc}
          section={section}
          links={linksResult.data ?? []}
          suggestions={suggestionsResult.data ?? []}
          editable={editable}
        />
      ))}

      {canReview ? (
        <Card>
          <CardHeader>
            <CardTitle>Xử lý của người kiểm tra</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <FormField id="review-note" label="Nội dung phản hồi">
              {(control) => (
                <Textarea
                  {...control}
                  rows={3}
                  value={reviewNote}
                  placeholder="Bắt buộc khi yêu cầu bổ sung"
                  onChange={(event) => setReviewNote(event.target.value)}
                />
              )}
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={review.isPending || !reviewNote.trim()}
                onClick={() => review.mutate("comment")}
              >
                Gửi phản hồi
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={review.isPending || !awaitingReview || !reviewNote.trim()}
                onClick={() => review.mutate("request_revision")}
              >
                Yêu cầu bổ sung
              </Button>
              <Button
                size="sm"
                disabled={review.isPending || !awaitingReview}
                onClick={() => review.mutate("confirm")}
              >
                Xác nhận
              </Button>
            </div>
            {canDecideReopen && pendingReopen ? (
              <div className="rounded-md border border-border-default p-3">
                <p className="text-body-sm text-text-primary">
                  Yêu cầu mở lại: {pendingReopen.reason}
                </p>
                <p className="text-body-sm text-text-tertiary">
                  Dự kiến sửa: {pendingReopen.planned_changes}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: pendingReopen.id, approve: true })}
                  >
                    Chấp thuận
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={decide.isPending || !reviewNote.trim()}
                    onClick={() => decide.mutate({ id: pendingReopen.id, approve: false })}
                  >
                    Từ chối
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử xử lý</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {(reviewsResult.data ?? []).length === 0 ? (
            <p className="text-body-sm text-text-tertiary">Chưa có phản hồi nào.</p>
          ) : (
            <ul className="grid gap-2">
              {(reviewsResult.data ?? []).map((row) => (
                <li key={row.id} className="rounded-md border border-border-default px-3 py-2">
                  <p className="text-body-sm text-text-primary">
                    {REVIEW_ACTION_LABEL[row.action]} — {row.actorName ?? "Người dùng"}
                    <span className="ml-2 text-caption text-text-tertiary">
                      {formatHanoiDateTime(row.created_at)}
                      {row.version ? ` · phiên bản ${row.version}` : ""}
                    </span>
                  </p>
                  {row.body ? (
                    <p className="whitespace-pre-wrap text-body-sm text-text-secondary">{row.body}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div>
            <p className="text-body-sm font-medium text-text-primary">Phiên bản đã gửi</p>
            {(versionsResult.data ?? []).length === 0 ? (
              <p className="text-body-sm text-text-tertiary">Chưa có phiên bản nào.</p>
            ) : (
              <ul className="mt-1 grid gap-1">
                {(versionsResult.data ?? []).map((row) => (
                  <li key={row.id} className="text-body-sm text-text-secondary">
                    v{row.version} · {formatHanoiDateTime(row.created_at)} · {row.submission_kind}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-body-sm text-text-tertiary">
        Nghĩa vụ và kỳ báo cáo xem tại <Link to="/reports">trang Báo cáo</Link>.
      </p>

      <Modal
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title="Yêu cầu mở lại báo cáo"
        description="Cần nêu lý do và nội dung dự kiến sửa; người xác nhận hoặc CMO sẽ quyết định."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReopenOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={askReopen.isPending || !reopenReason.trim() || !reopenPlanned.trim()}
              onClick={() => askReopen.mutate()}
            >
              Gửi yêu cầu
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <FormField id="reopen-reason" label="Lý do mở lại">
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
              />
            )}
          </FormField>
          <FormField id="reopen-planned" label="Nội dung dự kiến sửa">
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={reopenPlanned}
                onChange={(event) => setReopenPlanned(event.target.value)}
              />
            )}
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
