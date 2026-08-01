import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cenToast } from "@/components/ui/toast";
import { ReviewDrawer } from "@/components/mvp/review-drawer";
import { ScorecardDetail } from "@/components/mvp/scorecard-detail";
import { VotePanel } from "@/components/mvp/vote-panel";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDate } from "@/lib/datetime";
import {
  mvpAwardsQuery,
  mvpCycleQuery,
  mvpCycleTasksQuery,
  mvpReviewsQuery,
  mvpScorecardsQuery,
  type MvpAwardRow,
  type MvpCycleTaskRow,
  type MvpReviewRow,
  type MvpScorecardRow,
} from "@/lib/mvp-data";
import {
  collectCycleData,
  decideAward,
  generateAwardProposals,
  recomputeCycleScores,
  setCycleStatus,
} from "@/lib/mvp.functions";
import {
  MVP_AWARD_DESCRIPTION,
  MVP_AWARD_LABEL,
  MVP_AWARD_ORDER,
  MVP_AWARD_STATUS_LABEL,
  MVP_AWARD_STATUS_TONE,
  MVP_CYCLE_STATUS_LABEL,
  MVP_CYCLE_STATUS_TONE,
  MVP_CYCLE_TRANSITIONS,
  MVP_SCORECARD_STATUS_LABEL,
  MVP_SCORECARD_STATUS_TONE,
  MVP_TASK_WEIGHT_LABEL,
  MVP_TOTAL_MAX,
  type MvpCycleStatus,
  type MvpTaskWeight,
} from "@/lib/mvp-scoring";
import { PERMISSIONS } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/mvp/$cycleId")({
  head: () => ({
    meta: [
      { title: "Kỳ MVP — CEN 1.0" },
      {
        name: "description",
        content:
          "Chi tiết một kỳ MVP của CEN 1.0: bảng điểm theo tiêu chí, phiếu bầu, đánh giá thực tế và kết quả danh hiệu.",
      },
      { property: "og:title", content: "Kỳ MVP — CEN 1.0" },
      {
        property: "og:description",
        content:
          "Chi tiết một kỳ MVP của CEN 1.0: bảng điểm theo tiêu chí, phiếu bầu, đánh giá thực tế và kết quả danh hiệu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MvpCycleDetailPage,
});

function MvpCycleDetailPage() {
  const { cycleId } = Route.useParams();
  const access = useOrgAccess();
  const queryClient = useQueryClient();

  const cycle = useQuery(mvpCycleQuery(cycleId));
  const scorecards = useQuery(mvpScorecardsQuery(cycleId));
  const awards = useQuery(mvpAwardsQuery(cycleId));
  const reviews = useQuery({
    ...mvpReviewsQuery(cycleId),
    enabled: access.can(PERMISSIONS.MVP_REVIEW) || access.can(PERMISSIONS.MVP_APPROVE),
  });
  const cycleTasks = useQuery({
    ...mvpCycleTasksQuery(cycleId),
    enabled: access.can(PERMISSIONS.MVP_MANAGE),
  });

  const [detailFor, setDetailFor] = React.useState<MvpScorecardRow | null>(null);
  const [reviewFor, setReviewFor] = React.useState<MvpScorecardRow | null>(null);

  const collect = useServerFn(collectCycleData);
  const recompute = useServerFn(recomputeCycleScores);
  const propose = useServerFn(generateAwardProposals);
  const changeStatus = useServerFn(setCycleStatus);
  const decide = useServerFn(decideAward);

  function invalidateAll() {
    for (const key of [
      ["mvp-cycle", cycleId],
      ["mvp-cycles"],
      ["mvp-scorecards", cycleId],
      ["mvp-awards", cycleId],
      ["mvp-cycle-tasks", cycleId],
      ["mvp-reviews", cycleId],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const collectMutation = useMutation({
    mutationFn: () => collect({ data: { cycleId } }),
    onSuccess: (result) => {
      invalidateAll();
      cenToast.success(`Đã thu thập thêm ${result.added} công việc vào kỳ`);
    },
    onError: (error: Error) => cenToast.error("Không thu thập được", { description: error.message }),
  });

  const recomputeMutation = useMutation({
    mutationFn: () => recompute({ data: { cycleId } }),
    onSuccess: (result) => {
      invalidateAll();
      cenToast.success(`Đã tính điểm cho ${result.scored} nhân sự`);
    },
    onError: (error: Error) => cenToast.error("Không tính được điểm", { description: error.message }),
  });

  const proposeMutation = useMutation({
    mutationFn: () => propose({ data: { cycleId } }),
    onSuccess: () => {
      invalidateAll();
      cenToast.success("Đã cập nhật đề xuất danh hiệu");
    },
    onError: (error: Error) => cenToast.error("Không đề xuất được", { description: error.message }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: MvpCycleStatus) => changeStatus({ data: { cycleId, status } }),
    onSuccess: (result) => {
      invalidateAll();
      cenToast.success(`Kỳ chuyển sang: ${MVP_CYCLE_STATUS_LABEL[result.status]}`);
    },
    onError: (error: Error) => cenToast.error("Không đổi được trạng thái", { description: error.message }),
  });

  const decideMutation = useMutation({
    mutationFn: (input: { awardId: string; decision: "approved" | "not_awarded" }) =>
      decide({ data: input }),
    onSuccess: () => {
      invalidateAll();
      cenToast.success("Đã ghi nhận quyết định danh hiệu");
    },
    onError: (error: Error) => cenToast.error("Không lưu được quyết định", { description: error.message }),
  });

  if (!access.loading && !access.can(PERMISSIONS.MVP_VIEW)) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="Kỳ MVP" />
        <Card>
          <CardContent>
            <EmptyState
              title="Không có quyền truy cập"
              description="Bạn chưa được cấp quyền xem MVP và danh hiệu."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = cycle.data;
  const isPublished = data?.status === "published";
  const reviewBySubject = new Map((reviews.data ?? []).map((row) => [row.subject_id, row]));

  const scoreColumns = [
    {
      id: "member",
      header: "Nhân sự",
      className: "min-w-[200px]",
      cell: (row: MvpScorecardRow) => (
        <TableCellStack primary={row.userName ?? "—"} secondary={row.teamName ?? "Chưa có Team"} />
      ),
    },
    {
      id: "total",
      header: "Tổng điểm",
      className: "min-w-[120px]",
      cell: (row: MvpScorecardRow) => (
        <span className="text-text-primary">
          {row.total_score}/{MVP_TOTAL_MAX}
        </span>
      ),
    },
    {
      id: "breakdown",
      header: "Cấu phần",
      className: "min-w-[240px]",
      cell: (row: MvpScorecardRow) => (
        <span className="text-helper text-text-muted">
          Tự động {row.auto_score} · Vote {row.vote_score} · Đánh giá {row.review_score} · Trừ{" "}
          {row.penalty_score}
        </span>
      ),
    },
    {
      id: "status",
      header: "Tình trạng",
      className: "min-w-[180px]",
      cell: (row: MvpScorecardRow) => (
        <div className="flex min-w-0 flex-col gap-1">
          <StatusBadge
            label={MVP_SCORECARD_STATUS_LABEL[row.status]}
            tone={MVP_SCORECARD_STATUS_TONE[row.status]}
          />
          <span className="text-caption text-text-muted">
            Dữ liệu {row.data_completeness}%
            {row.ineligible_reason ? ` · ${row.ineligible_reason}` : ""}
          </span>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Thao tác",
      className: "min-w-[200px]",
      cell: (row: MvpScorecardRow) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDetailFor(row)}>
            Xem chi tiết
          </Button>
          {access.can(PERMISSIONS.MVP_REVIEW) && !isPublished && row.user_id !== access.userId ? (
            <Button variant="secondary" size="sm" onClick={() => setReviewFor(row)}>
              {reviewBySubject.get(row.user_id)?.status === "submitted" ? "Xem đánh giá" : "Chấm điểm"}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const taskColumns = [
    {
      id: "task",
      header: "Công việc",
      className: "min-w-[240px]",
      cell: (row: MvpCycleTaskRow) => (
        <TableCellStack primary={row.taskName} secondary={row.userName ?? "—"} />
      ),
    },
    {
      id: "weight",
      header: "Trọng số",
      className: "min-w-[140px]",
      cell: (row: MvpCycleTaskRow) => (
        <Badge variant="neutral" size="sm">
          {MVP_TASK_WEIGHT_LABEL[row.weight as MvpTaskWeight] ?? row.weight}
        </Badge>
      ),
    },
    {
      id: "deadline",
      header: "Deadline gốc",
      className: "min-w-[150px]",
      cell: (row: MvpCycleTaskRow) => (
        <span className="text-text-secondary">{formatHanoiDate(row.original_deadline)}</span>
      ),
    },
    {
      id: "lock",
      header: "Trạng thái dữ liệu",
      className: "min-w-[150px]",
      cell: (row: MvpCycleTaskRow) => (
        <Badge variant={row.is_locked ? "success" : "info"} size="sm">
          {row.is_locked ? "Đã khóa" : "Đang mở"}
        </Badge>
      ),
    },
  ];

  const awardByType = new Map((awards.data ?? []).map((row) => [row.award_type, row]));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={
          data
            ? `Kỳ ${formatHanoiDate(data.week_start)} – ${formatHanoiDate(data.week_end)}`
            : "Kỳ MVP"
        }
        description="Bảng điểm minh bạch theo từng tiêu chí; mọi thay đổi đều được ghi nhật ký."
        meta={
          data ? (
            <StatusBadge
              label={MVP_CYCLE_STATUS_LABEL[data.status]}
              tone={MVP_CYCLE_STATUS_TONE[data.status]}
            />
          ) : null
        }
        breadcrumb={
          <Link to="/mvp" className="text-helper text-text-muted hover:text-text-primary">
            ← Tất cả kỳ MVP
          </Link>
        }
        actions={
          data && !isPublished ? (
            <div className="flex flex-wrap gap-2">
              {access.can(PERMISSIONS.MVP_MANAGE) ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={collectMutation.isPending}
                    onClick={() => collectMutation.mutate()}
                  >
                    Thu thập dữ liệu
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={recomputeMutation.isPending}
                    onClick={() => recomputeMutation.mutate()}
                  >
                    Tính lại điểm
                  </Button>
                </>
              ) : null}
              {access.can(PERMISSIONS.MVP_APPROVE) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={proposeMutation.isPending}
                  onClick={() => proposeMutation.mutate()}
                >
                  Đề xuất danh hiệu
                </Button>
              ) : null}
              {MVP_CYCLE_TRANSITIONS[data.status].map((next) => (
                <Button
                  key={next}
                  size="sm"
                  loading={statusMutation.isPending && statusMutation.variables === next}
                  disabled={
                    next === "published"
                      ? !access.can(PERMISSIONS.MVP_APPROVE)
                      : !access.can(PERMISSIONS.MVP_MANAGE)
                  }
                  onClick={() => statusMutation.mutate(next)}
                >
                  {`Chuyển sang ${MVP_CYCLE_STATUS_LABEL[next]}`}
                </Button>
              ))}
            </div>
          ) : null
        }
      />

      <Tabs defaultValue="scores">
        <TabsList>
          <TabsTrigger value="scores">Bảng điểm</TabsTrigger>
          <TabsTrigger value="awards">Danh hiệu</TabsTrigger>
          <TabsTrigger value="vote">Bỏ phiếu</TabsTrigger>
          {access.can(PERMISSIONS.MVP_MANAGE) ? (
            <TabsTrigger value="data">Dữ liệu công việc</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="scores" className="mt-4">
          <DataTable
            columns={scoreColumns}
            data={scorecards.data ?? []}
            getRowId={(row) => row.id}
            density="compact"
            loading={scorecards.isLoading}
            error={Boolean(scorecards.error)}
            onRetry={() => void scorecards.refetch()}
            errorTitle="Không tải được bảng điểm"
            emptyTitle="Kỳ này chưa có bảng điểm"
            emptyDescription="Chạy Thu thập dữ liệu rồi Tính lại điểm để khởi tạo bảng điểm."
          />
        </TabsContent>

        <TabsContent value="awards" className="mt-4">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {MVP_AWARD_ORDER.map((type) => {
              const award: MvpAwardRow | undefined = awardByType.get(type);
              return (
                <Card key={type}>
                  <CardContent className="flex min-w-0 flex-col gap-3">
                    <SectionHeader
                      title={MVP_AWARD_LABEL[type]}
                      description={MVP_AWARD_DESCRIPTION[type]}
                      actions={
                        award ? (
                          <StatusBadge
                            label={MVP_AWARD_STATUS_LABEL[award.status]}
                            tone={MVP_AWARD_STATUS_TONE[award.status]}
                          />
                        ) : null
                      }
                    />
                    {award?.recipient_id ? (
                      <div className="min-w-0">
                        <p className="text-body font-medium text-text-primary">
                          {award.recipientName}
                        </p>
                        <p className="text-helper text-text-muted">
                          {award.recipientTeam ?? "Chưa có Team"} · {award.reason}
                        </p>
                      </div>
                    ) : (
                      <p className="text-helper text-text-muted">
                        {award?.reason ?? "Chưa có đề xuất cho danh hiệu này."}
                      </p>
                    )}
                    {award && access.can(PERMISSIONS.MVP_APPROVE) && !isPublished ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={!award.recipient_id}
                          loading={
                            decideMutation.isPending &&
                            decideMutation.variables?.awardId === award.id &&
                            decideMutation.variables?.decision === "approved"
                          }
                          onClick={() =>
                            decideMutation.mutate({ awardId: award.id, decision: "approved" })
                          }
                        >
                          Phê duyệt
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={
                            decideMutation.isPending &&
                            decideMutation.variables?.awardId === award.id &&
                            decideMutation.variables?.decision === "not_awarded"
                          }
                          onClick={() =>
                            decideMutation.mutate({ awardId: award.id, decision: "not_awarded" })
                          }
                        >
                          Không trao kỳ này
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="vote" className="mt-4">
          {data ? (
            <VotePanel
              cycle={data}
              userId={access.userId}
              canVote={access.can(PERMISSIONS.MVP_VOTE)}
            />
          ) : null}
        </TabsContent>

        {access.can(PERMISSIONS.MVP_MANAGE) ? (
          <TabsContent value="data" className="mt-4">
            <DataTable
              columns={taskColumns}
              data={cycleTasks.data ?? []}
              getRowId={(row) => row.id}
              density="compact"
              loading={cycleTasks.isLoading}
              error={Boolean(cycleTasks.error)}
              onRetry={() => void cycleTasks.refetch()}
              errorTitle="Không tải được dữ liệu công việc"
              emptyTitle="Chưa thu thập công việc nào"
              emptyDescription="Bấm Thu thập dữ liệu để lấy công việc có deadline trong tuần của kỳ."
            />
          </TabsContent>
        ) : null}
      </Tabs>

      <ScorecardDetail
        open={detailFor !== null}
        onOpenChange={(open) => !open && setDetailFor(null)}
        cycleId={cycleId}
        userId={detailFor?.user_id ?? null}
        userName={detailFor?.userName ?? ""}
        totalScore={detailFor?.total_score ?? 0}
      />

      {reviewFor && access.userId ? (
        <ReviewDrawer
          open
          onOpenChange={(open) => !open && setReviewFor(null)}
          cycleId={cycleId}
          reviewerId={access.userId}
          subjectId={reviewFor.user_id}
          subjectName={reviewFor.userName ?? ""}
          existing={reviewBySubject.get(reviewFor.user_id) as MvpReviewRow | undefined}
        />
      ) : null}
    </div>
  );
}
