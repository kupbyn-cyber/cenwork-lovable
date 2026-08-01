import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AnnouncementActions } from "@/components/announcement/announcement-actions";
import { AnnouncementBody } from "@/components/announcement/announcement-body";
import { AnnouncementProgress } from "@/components/announcement/announcement-progress";
import { CommentThread } from "@/components/announcement/comment-thread";
import { SurveyForm } from "@/components/announcement/survey-form";
import { SurveyResults } from "@/components/announcement/survey-results";
import { VersionHistory } from "@/components/announcement/version-history";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useOrgAccess } from "@/hooks/use-org-access";
import {
  ANNOUNCEMENT_STATUS_LABEL,
  announcementQuery,
  announcementRecipientsQuery,
  effectiveRecipientStatus,
  markOpened,
  markReadCompleted,
  RECIPIENT_STATUS_LABEL,
  RECIPIENT_STATUS_TONE,
  type RecipientRow,
} from "@/lib/announcement-data";
import {
  acknowledgeWithAnswers,
  surveyQuery,
  validateAnswers,
  type AnswerDraft,
  type QuestionDraft,
} from "@/lib/announcement-interaction";
import { formatHanoiDateTime } from "@/lib/datetime";

const TITLE = "Chi tiết thông báo nội bộ — CEN 1.0";
const DESCRIPTION =
  "Đọc toàn bộ nội dung thông báo nội bộ, trả lời khảo sát, bình luận và xác nhận trước hạn trong CEN 1.0.";

export const Route = createFileRoute("/_authenticated/announcements/$announcementId")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnnouncementDetailPage,
});

function AnnouncementDetailPage() {
  const { announcementId } = useParams({ from: "/_authenticated/announcements/$announcementId" });
  const { user } = useAuth();
  const { isAdmin, isCmo } = useOrgAccess();
  const queryClient = useQueryClient();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [readToEnd, setReadToEnd] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, AnswerDraft>>({});

  const announcement = useQuery(announcementQuery(announcementId));
  const recipients = useQuery(announcementRecipientsQuery(announcementId));
  const version = announcement.data?.current_version ?? 1;
  const survey = useQuery({
    ...surveyQuery(announcementId, version),
    enabled: Boolean(announcement.data),
  });

  const myRecipient: RecipientRow | null =
    (recipients.data ?? []).find((row) => row.user_id === user?.id) ?? null;

  const isAuthor = announcement.data?.created_by === user?.id;
  const canModerate = Boolean(isAuthor || isAdmin || isCmo);

  function refresh() {
    for (const key of [
      "announcement",
      "announcement-recipients",
      "announcement-inbox",
      "announcement-overdue",
      "announcement-answers",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  React.useEffect(() => {
    if (!myRecipient) return;
    void markOpened(myRecipient).then(refresh).catch(() => undefined);
    // chỉ ghi nhận mở lần đầu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRecipient?.id]);

  React.useEffect(() => {
    setReadToEnd(Boolean(myRecipient?.read_completed_at));
  }, [myRecipient?.read_completed_at, version]);

  const onScroll = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node || readToEnd) return;
    const reachedEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 8;
    if (!reachedEnd) return;
    setReadToEnd(true);
    if (myRecipient) void markReadCompleted(myRecipient).then(refresh).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRecipient, readToEnd]);

  // Nội dung ngắn không tạo thanh cuộn → coi như đã đọc hết.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node || readToEnd) return;
    if (node.scrollHeight <= node.clientHeight + 8) {
      setReadToEnd(true);
      if (myRecipient) void markReadCompleted(myRecipient).then(refresh).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement.data?.body, myRecipient?.id, readToEnd]);

  const questions = survey.data?.questions ?? [];
  const options = survey.data?.options ?? [];

  const ack = useMutation({
    mutationFn: () =>
      acknowledgeWithAnswers(
        announcementId,
        questions.map(
          (question) =>
            drafts[question.id] ?? { questionId: question.id, optionIds: [], text: "" },
        ),
      ),
    onSuccess: () => {
      refresh();
      toast.success("Đã xác nhận đọc thông báo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (announcement.isError) {
    return (
      <ErrorState
        title="Không tải được thông báo"
        description="Bạn có thể không còn quyền xem hoặc thông báo đã bị xóa."
        onRetry={() => void announcement.refetch()}
      />
    );
  }

  if (announcement.isLoading) {
    return <p className="text-body-sm text-text-muted">Đang tải…</p>;
  }

  const row = announcement.data;
  if (!row) {
    return (
      <ErrorState title="Không tìm thấy thông báo" description="Thông báo không tồn tại." />
    );
  }

  const myStatus = myRecipient ? effectiveRecipientStatus(myRecipient) : null;
  const done = myRecipient?.status === "completed" || myRecipient?.status === "exempt";
  const revoked = Boolean(row.revoked_at);
  const archived = Boolean(row.archived_at);
  const active = row.status === "published" && !revoked && !archived;
  const answerError = validateAnswers(questions, drafts);

  const canSeeResults =
    canModerate ||
    row.result_visibility === "after_submit"
      ? canModerate || done
      : row.result_visibility === "after_due"
        ? canModerate || (row.due_at ? new Date(row.due_at).getTime() < Date.now() : false)
        : canModerate;

  const questionDrafts: QuestionDraft[] = questions.map((question) => ({
    type: question.question_type,
    content: question.content,
    required: question.is_required,
    min: question.min_select,
    max: question.max_select,
    options: options
      .filter((option) => option.question_id === question.id)
      .map((option) => option.label),
  }));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={row.title || "(Chưa có tiêu đề)"}
        description={
          row.due_at
            ? `Hạn xác nhận: ${formatHanoiDateTime(row.due_at)} • Phiên bản ${row.current_version}`
            : "Chưa đặt hạn xác nhận."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={row.status === "published" ? "success" : "neutral"}
              label={ANNOUNCEMENT_STATUS_LABEL[row.status]}
            />
            {revoked ? <StatusBadge tone="error" label="Đã thu hồi" /> : null}
            {archived ? <StatusBadge tone="neutral" label="Đã lưu trữ" /> : null}
            {myStatus ? (
              <StatusBadge
                tone={RECIPIENT_STATUS_TONE[myStatus]}
                label={RECIPIENT_STATUS_LABEL[myStatus]}
              />
            ) : null}
          </div>
        }
      />

      {revoked ? (
        <p className="rounded-control border border-state-danger/50 bg-state-danger/10 p-3 text-body-sm text-text-primary">
          Thông báo đã được thu hồi{row.revoke_reason ? `: ${row.revoke_reason}` : "."} Bạn không
          cần xác nhận nữa.
        </p>
      ) : null}

      <Tabs defaultValue="content" className="min-w-0">
        <TabsList>
          <TabsTrigger value="content">Nội dung</TabsTrigger>
          {questions.length > 0 ? <TabsTrigger value="survey">Khảo sát</TabsTrigger> : null}
          <TabsTrigger value="comments">Bình luận</TabsTrigger>
          {canModerate ? <TabsTrigger value="progress">Tiến độ</TabsTrigger> : null}
          <TabsTrigger value="history">Phiên bản</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="max-h-[55vh] min-w-0 overflow-y-auto rounded-control border border-border-default p-4"
              >
                <AnnouncementBody body={row.body} />
              </div>

              {myRecipient && !revoked ? (
                <div className="flex min-w-0 flex-col gap-2">
                  {!done && questions.length > 0 ? (
                    <div className="flex min-w-0 flex-col gap-3 rounded-control border border-border-default p-3">
                      <SectionHeader
                        title="Trả lời khảo sát trước khi xác nhận"
                        description="Câu hỏi bắt buộc phải có câu trả lời hợp lệ."
                      />
                      <SurveyForm
                        questions={questions}
                        options={options}
                        drafts={drafts}
                        onChange={(questionId, next) =>
                          setDrafts((prev) => ({ ...prev, [questionId]: next }))
                        }
                      />
                    </div>
                  ) : null}

                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="min-w-0 break-words text-body-sm text-text-muted">
                      {done
                        ? myRecipient.acknowledged_at
                          ? `Đã xác nhận lúc ${formatHanoiDateTime(myRecipient.acknowledged_at)}${myRecipient.is_late ? " (trễ hạn)" : ""}`
                          : "Bạn được miễn xác nhận thông báo này."
                        : !readToEnd
                          ? "Cuộn hết nội dung để bật nút xác nhận."
                          : (answerError ?? "Bạn đã đọc hết nội dung, có thể xác nhận.")}
                    </p>
                    {!done ? (
                      <Button
                        type="button"
                        disabled={!readToEnd || Boolean(answerError) || ack.isPending}
                        loading={ack.isPending}
                        onClick={() => ack.mutate()}
                      >
                        Tôi đã đọc và xác nhận
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {canModerate ? (
                <div className="flex min-w-0 flex-col gap-2 border-t border-border-default pt-4">
                  <SectionHeader
                    title="Quản trị thông báo"
                    description="Chỉnh sửa nhỏ giữ nguyên xác nhận; phiên bản mới buộc xác nhận lại."
                  />
                  <AnnouncementActions announcement={row} questions={questionDrafts} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {questions.length > 0 ? (
          <TabsContent value="survey">
            <Card>
              <CardContent className="flex min-w-0 flex-col gap-4">
                <SectionHeader
                  title="Kết quả khảo sát"
                  description="Tổng hợp theo phiên bản đang hiệu lực."
                />
                {canSeeResults ? (
                  <SurveyResults
                    announcementId={announcementId}
                    version={version}
                    visibility={row.result_visibility}
                    canSeeFullResult={canModerate}
                  />
                ) : (
                  <p className="text-body-sm text-text-muted">
                    Kết quả chưa được công khai cho người nhận.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="comments">
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <SectionHeader
                title="Bình luận"
                description="Trả lời một cấp và nhắc tên trong phạm vi thông báo."
              />
              <CommentThread
                announcementId={announcementId}
                authorId={row.created_by}
                commentsEnabled={row.comments_enabled}
                active={active}
                canModerate={canModerate}
                readOnly={archived}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {canModerate ? (
          <TabsContent value="progress">
            <Card>
              <CardContent className="flex min-w-0 flex-col gap-4">
                <SectionHeader
                  title="Tiến độ xác nhận"
                  description="Theo dõi trạng thái của từng người nhận."
                />
                <AnnouncementProgress announcementId={announcementId} />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="history">
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <SectionHeader
                title="Lịch sử phiên bản"
                description="Bao gồm phiên bản mới và các chỉnh sửa nhỏ."
              />
              <VersionHistory announcementId={announcementId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
