import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import { activeMembersQuery } from "@/lib/org-data";
import {
  decideBonus,
  mvpBonusQuery,
  mvpReviewsQuery,
  mvpScorecardsQuery,
  proposeBonus,
  saveReview,
  withdrawBonus,
  type MvpBonusRow,
  type MvpReviewRow,
} from "@/lib/mvp-data";
import {
  MVP_BONUS_MAX,
  MVP_BONUS_OPTIONS,
  MVP_BONUS_STATUS_LABEL,
  MVP_BONUS_STATUS_TONE,
  MVP_CRITERION_LABEL,
  MVP_REVIEW_CRITERIA,
  MVP_REVIEW_LEVELS,
  MVP_REVIEW_LEVEL_LABEL,
  MVP_REVIEW_MAX,
  requiresEvidence,
  requiresReason,
  type MvpBonusStatus,
  type MvpReviewLevel,
} from "@/lib/mvp-scoring";

/**
 * MVP-REVIEW-01 — màn hình thao tác chính "Đánh giá Team".
 * Cột trái: danh sách nhân sự thuộc phạm vi chấm. Cột phải: form chấm điểm + bonus.
 * Leader chấm Member cùng Team; CMO (và Admin) chấm Leader. Không ai tự chấm mình.
 */

type ScoreKey = "quality" | "proactive" | "impact" | "teamwork";

interface SubjectRow {
  id: string;
  name: string;
  teamName: string | null;
  totalScore: number | null;
}

export interface TeamReviewWorkspaceProps {
  cycleId: string;
  isPublished: boolean;
}

export function TeamReviewWorkspace({ cycleId, isPublished }: TeamReviewWorkspaceProps) {
  const access = useOrgAccess();
  const queryClient = useQueryClient();

  const members = useQuery(activeMembersQuery());
  const scorecards = useQuery(mvpScorecardsQuery(cycleId));
  const reviews = useQuery(mvpReviewsQuery(cycleId));
  const bonuses = useQuery(mvpBonusQuery(cycleId));

  const canReviewLeaders = access.isCmo || access.isAdmin;
  const [keyword, setKeyword] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const subjects: SubjectRow[] = React.useMemo(() => {
    const scoreByUser = new Map((scorecards.data ?? []).map((row) => [row.user_id, row]));
    return (members.data ?? [])
      .filter((member) => member.id !== access.userId)
      .filter((member) =>
        canReviewLeaders
          ? member.role === "leader"
          : access.isLeader &&
            Boolean(access.leaderTeamId) &&
            member.primary_team_id === access.leaderTeamId &&
            member.role !== "admin" &&
            member.role !== "cmo",
      )
      .map((member) => {
        const card = scoreByUser.get(member.id);
        return {
          id: member.id,
          name: member.display_name,
          teamName: card?.teamName ?? null,
          totalScore: card ? card.total_score : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [members.data, scorecards.data, access.userId, access.isLeader, access.leaderTeamId, canReviewLeaders]);

  const visibleSubjects = React.useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((row) => row.name.toLowerCase().includes(q));
  }, [subjects, keyword]);

  React.useEffect(() => {
    if (selectedId && subjects.some((row) => row.id === selectedId)) return;
    setSelectedId(subjects[0]?.id ?? null);
  }, [subjects, selectedId]);

  const reviewBySubject = new Map((reviews.data ?? []).map((row) => [row.subject_id, row]));
  const selected = subjects.find((row) => row.id === selectedId) ?? null;
  const existing = selectedId ? reviewBySubject.get(selectedId) : undefined;
  const subjectBonuses = (bonuses.data ?? []).filter((row) => row.subject_id === selectedId);

  const loading = members.isLoading || reviews.isLoading;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Card className="min-w-0">
        <CardContent className="flex min-w-0 flex-col gap-3">
          <SectionHeader
            title="Nhân sự cần chấm"
            description={
              canReviewLeaders ? "CMO chấm Trưởng nhóm." : "Trưởng nhóm chấm thành viên cùng Team."
            }
          />
          <Input
            value={keyword}
            placeholder="Tìm theo tên"
            onChange={(event) => setKeyword(event.target.value)}
          />
          {loading ? (
            <p className="text-helper text-text-muted">Đang tải danh sách…</p>
          ) : visibleSubjects.length === 0 ? (
            <EmptyState
              title="Không có nhân sự thuộc phạm vi chấm"
              description="Bạn chỉ chấm được nhân sự trong phạm vi được phân quyền."
            />
          ) : (
            <ul className="flex min-w-0 flex-col gap-1">
              {visibleSubjects.map((row) => {
                const review = reviewBySubject.get(row.id);
                const active = row.id === selectedId;
                return (
                  <li key={row.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`flex w-full min-w-0 flex-col gap-1 rounded-md border px-3 py-2 text-left transition ${
                        active
                          ? "border-border-strong bg-surface-muted"
                          : "border-transparent hover:bg-surface-muted"
                      }`}
                    >
                      <span className="truncate text-body text-text-primary">{row.name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
                        <span className="truncate">{row.teamName ?? "Chưa có Team"}</span>
                        <Badge
                          variant={review?.status === "submitted" ? "success" : "neutral"}
                          size="sm"
                        >
                          {review?.status === "submitted"
                            ? "Đã chấm"
                            : review
                              ? "Bản nháp"
                              : "Chưa chấm"}
                        </Badge>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        {selected && access.userId ? (
          <>
            <ReviewForm
              key={`review-${selected.id}`}
              cycleId={cycleId}
              reviewerId={access.userId}
              subject={selected}
              existing={existing}
              disabled={isPublished}
              onSaved={() => {
                void queryClient.invalidateQueries({ queryKey: ["mvp-reviews", cycleId] });
              }}
            />
            <BonusPanel
              key={`bonus-${selected.id}`}
              cycleId={cycleId}
              proposerId={access.userId}
              subject={selected}
              rows={subjectBonuses}
              canDecide={access.isCmo}
              disabled={isPublished}
              onChanged={() => {
                void queryClient.invalidateQueries({ queryKey: ["mvp-bonus", cycleId] });
              }}
            />
          </>
        ) : (
          <Card>
            <CardContent>
              <EmptyState
                title="Chọn một nhân sự để chấm điểm"
                description="Danh sách bên trái hiển thị nhân sự bạn được phép đánh giá trong kỳ này."
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ReviewForm({
  cycleId,
  reviewerId,
  subject,
  existing,
  disabled,
  onSaved,
}: {
  cycleId: string;
  reviewerId: string;
  subject: SubjectRow;
  existing: MvpReviewRow | undefined;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [scores, setScores] = React.useState<Record<ScoreKey, number>>({
    quality: existing?.quality_score ?? 0,
    proactive: existing?.proactive_score ?? 0,
    impact: existing?.impact_score ?? 0,
    teamwork: existing?.teamwork_score ?? 0,
  });
  const [reason, setReason] = React.useState(existing?.reason ?? "");
  const [evidence, setEvidence] = React.useState(existing?.evidence ?? "");
  const [errors, setErrors] = React.useState<{ reason?: string; evidence?: string }>({});

  const locked = disabled || existing?.status === "submitted";
  const maxScore = Math.max(...Object.values(scores));
  const needReason = requiresReason(maxScore);
  const needEvidence = requiresEvidence(maxScore);
  const totalReview = Object.values(scores).reduce((sum, value) => sum + value, 0);

  const mutation = useMutation({
    mutationFn: (submit: boolean) =>
      saveReview({
        cycleId,
        subjectId: subject.id,
        reviewerId,
        quality: scores.quality,
        proactive: scores.proactive,
        impact: scores.impact,
        teamwork: scores.teamwork,
        reason: reason.trim(),
        evidence: evidence.trim(),
        submit,
        existingId: existing?.id,
      }),
    onSuccess: (_data, submit) => {
      onSaved();
      cenToast.success(submit ? "Đã gửi đánh giá" : "Đã lưu bản nháp");
    },
    onError: (error: Error) => cenToast.error("Không lưu được", { description: error.message }),
  });

  function run(submit: boolean) {
    if (submit) {
      const next: { reason?: string; evidence?: string } = {};
      if (!reason.trim()) next.reason = "Phải nhập lý do đánh giá";
      else if (needReason && reason.trim().length < 10) {
        next.reason = "Điểm 4–5 cần lý do cụ thể (tối thiểu 10 ký tự)";
      }
      if (needEvidence && !evidence.trim()) {
        next.evidence = "Điểm 5 bắt buộc có ít nhất một bằng chứng";
      }
      setErrors(next);
      if (Object.keys(next).length > 0) return;
    }
    mutation.mutate(submit);
  }

  return (
    <Card className="min-w-0">
      <CardContent className="flex min-w-0 flex-col gap-4">
        <SectionHeader
          title={`Đánh giá — ${subject.name}`}
          description={`4 tiêu chí × 5 điểm, tổng tối đa ${MVP_REVIEW_MAX} điểm của kỳ.`}
          actions={
            <Badge variant={totalReview >= 16 ? "success" : "neutral"} size="sm">
              {totalReview}/{MVP_REVIEW_MAX}
            </Badge>
          }
        />

        {existing?.status === "submitted" ? (
          <p className="text-helper text-text-muted">
            Đánh giá đã gửi nên không thể chỉnh sửa. Cần thay đổi thì đề nghị CMO xử lý.
          </p>
        ) : null}

        <div className="flex min-w-0 flex-col gap-4">
          {MVP_REVIEW_CRITERIA.map((criterion) => {
            const key = criterion as ScoreKey;
            const value = scores[key];
            return (
              <div key={key} className="flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="text-body text-text-primary">
                    {MVP_CRITERION_LABEL[criterion]}
                  </span>
                  <span className="text-caption text-text-muted">
                    {MVP_REVIEW_LEVEL_LABEL[value as MvpReviewLevel]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MVP_REVIEW_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      disabled={locked}
                      onClick={() => setScores((prev) => ({ ...prev, [key]: level }))}
                      className={`h-9 min-w-9 rounded-md border px-3 text-body transition disabled:opacity-60 ${
                        value === level
                          ? "border-border-strong bg-surface-muted text-text-primary"
                          : "border-border text-text-secondary hover:bg-surface-muted"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <FormField
          id="review-reason"
          label="Lý do đánh giá"
          required={needReason}
          helperText="Điểm 4 hoặc 5 bắt buộc nêu lý do cụ thể."
          error={errors.reason}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={reason}
              disabled={locked}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FormField>

        <FormField
          id="review-evidence"
          label="Bằng chứng"
          required={needEvidence}
          helperText="Điểm 5 bắt buộc có link công việc, báo cáo hoặc kết quả cụ thể."
          error={errors.evidence}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={evidence}
              disabled={locked}
              onChange={(event) => setEvidence(event.target.value)}
            />
          )}
        </FormField>

        {!locked ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => run(false)}
              loading={mutation.isPending && mutation.variables === false}
            >
              Lưu nháp
            </Button>
            <Button
              onClick={() => run(true)}
              loading={mutation.isPending && mutation.variables === true}
            >
              Gửi đánh giá
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BonusPanel({
  cycleId,
  proposerId,
  subject,
  rows,
  canDecide,
  disabled,
  onChanged,
}: {
  cycleId: string;
  proposerId: string;
  subject: SubjectRow;
  rows: MvpBonusRow[];
  canDecide: boolean;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [points, setPoints] = React.useState<number>(1);
  const [reason, setReason] = React.useState("");
  const [evidence, setEvidence] = React.useState("");
  const [errors, setErrors] = React.useState<{ reason?: string; evidence?: string }>({});

  const approved = rows
    .filter((row) => row.status === "approved")
    .reduce((sum, row) => sum + row.points, 0);
  const remaining = Math.max(0, MVP_BONUS_MAX - approved);

  const proposeMutation = useMutation({
    mutationFn: () =>
      proposeBonus({ cycleId, subjectId: subject.id, proposerId, points, reason, evidence }),
    onSuccess: () => {
      setReason("");
      setEvidence("");
      setErrors({});
      onChanged();
      cenToast.success("Đã gửi đề xuất thưởng, chờ CMO duyệt");
    },
    onError: (error: Error) =>
      cenToast.error("Không gửi được đề xuất", { description: error.message }),
  });

  const decideMutation = useMutation({
    mutationFn: (input: { id: string; approve: boolean }) => decideBonus(input),
    onSuccess: () => {
      onChanged();
      cenToast.success("Đã ghi nhận quyết định thưởng");
    },
    onError: (error: Error) =>
      cenToast.error("Không lưu được quyết định", { description: error.message }),
  });

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => withdrawBonus(id),
    onSuccess: () => {
      onChanged();
      cenToast.success("Đã thu hồi đề xuất");
    },
    onError: (error: Error) => cenToast.error("Không thu hồi được", { description: error.message }),
  });

  function submit() {
    const next: { reason?: string; evidence?: string } = {};
    if (!reason.trim()) next.reason = "Phải nêu lý do đóng góp đặc biệt";
    if (!evidence.trim()) next.evidence = "Phải có bằng chứng cho đề xuất thưởng";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    proposeMutation.mutate();
  }

  return (
    <Card className="min-w-0">
      <CardContent className="flex min-w-0 flex-col gap-4">
        <SectionHeader
          title="Bonus đóng góp đặc biệt"
          description={`Đề xuất +1, +2 hoặc +3 điểm. Tổng thưởng đã duyệt tối đa +${MVP_BONUS_MAX} mỗi kỳ.`}
          actions={
            <Badge variant={approved > 0 ? "success" : "neutral"} size="sm">
              Đã duyệt +{approved}/{MVP_BONUS_MAX}
            </Badge>
          }
        />

        {rows.length > 0 ? (
          <ul className="flex min-w-0 flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex min-w-0 flex-col gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="info" size="sm">{`+${row.points}`}</Badge>
                  <StatusBadge
                    label={MVP_BONUS_STATUS_LABEL[row.status as MvpBonusStatus]}
                    tone={MVP_BONUS_STATUS_TONE[row.status as MvpBonusStatus]}
                  />
                  <span className="truncate text-caption text-text-muted">
                    Đề xuất bởi {row.proposerName ?? "—"}
                  </span>
                </div>
                <p className="text-helper text-text-secondary">{row.reason}</p>
                <p className="text-caption text-text-muted">Bằng chứng: {row.evidence}</p>
                {!disabled && row.status === "pending" ? (
                  <div className="flex flex-wrap gap-2">
                    {canDecide && row.proposer_id !== proposerId ? (
                      <>
                        <Button
                          size="sm"
                          loading={
                            decideMutation.isPending &&
                            decideMutation.variables?.id === row.id &&
                            decideMutation.variables.approve
                          }
                          onClick={() => decideMutation.mutate({ id: row.id, approve: true })}
                        >
                          Duyệt thưởng
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={
                            decideMutation.isPending &&
                            decideMutation.variables?.id === row.id &&
                            !decideMutation.variables.approve
                          }
                          onClick={() => decideMutation.mutate({ id: row.id, approve: false })}
                        >
                          Từ chối
                        </Button>
                      </>
                    ) : null}
                    {row.proposer_id === proposerId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={withdrawMutation.isPending && withdrawMutation.variables === row.id}
                        onClick={() => withdrawMutation.mutate(row.id)}
                      >
                        Thu hồi
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-helper text-text-muted">Chưa có đề xuất thưởng nào trong kỳ này.</p>
        )}

        {!disabled ? (
          <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-3">
            <FormField id="bonus-points" label="Mức đề xuất" required>
              {() => (
                <div className="flex flex-wrap gap-2">
                  {MVP_BONUS_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={option > remaining}
                      onClick={() => setPoints(option)}
                      className={`h-9 rounded-md border px-3 text-body transition disabled:opacity-50 ${
                        points === option
                          ? "border-border-strong bg-surface-muted text-text-primary"
                          : "border-border text-text-secondary hover:bg-surface-muted"
                      }`}
                    >
                      {`+${option}`}
                    </button>
                  ))}
                </div>
              )}
            </FormField>
            <FormField id="bonus-reason" label="Lý do đóng góp đặc biệt" required error={errors.reason}>
              {(control) => (
                <Textarea
                  {...control}
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </FormField>
            <FormField id="bonus-evidence" label="Bằng chứng" required error={errors.evidence}>
              {(control) => (
                <Textarea
                  {...control}
                  rows={2}
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                />
              )}
            </FormField>
            <div>
              <Button
                onClick={submit}
                loading={proposeMutation.isPending}
                disabled={remaining === 0}
              >
                {remaining === 0 ? "Đã đạt trần +5 điểm" : "Gửi đề xuất thưởng"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
