import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDate } from "@/lib/datetime";
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  ensureTeamSummary,
  feedbackTeamSummary,
  hanoiWeekStart,
  publishTeamSummary,
  saveTeamSummary,
  teamSummariesQuery,
  type TeamSummaryRow,
} from "@/lib/report-workflow-data";

/**
 * CEN 1.0 — REPORT-02: tổng hợp Team hằng tuần.
 * Bản nháp dựng từ dữ liệu thật (nghĩa vụ, báo cáo tuần, công việc); Leader tự phát hành.
 */
type SummaryDraft = Pick<
  TeamSummaryRow,
  "highlights" | "unfinished" | "blockers" | "next_priorities" | "support_needed" | "submission_note"
>;

function draftOf(row: TeamSummaryRow): SummaryDraft {
  return {
    highlights: row.highlights,
    unfinished: row.unfinished,
    blockers: row.blockers,
    next_priorities: row.next_priorities,
    support_needed: row.support_needed,
    submission_note: row.submission_note,
  };
}

export function TeamSummaryPanel() {
  const access = useOrgAccess();
  const queryClient = useQueryClient();
  const summaries = useQuery(teamSummariesQuery());
  const [weekStart, setWeekStart] = React.useState(() => hanoiWeekStart());
  const [drafts, setDrafts] = React.useState<Record<string, SummaryDraft>>({});
  const [feedback, setFeedback] = React.useState<Record<string, string>>({});

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["team-weekly-summaries"] });

  const build = useMutation({
    mutationFn: () => ensureTeamSummary(access.leaderTeamId!, weekStart),
    onSuccess: () => {
      invalidate();
      cenToast.success("Đã dựng bản tổng hợp từ dữ liệu tuần");
    },
    onError: (error: Error) => cenToast.error("Không dựng được", { description: error.message }),
  });

  const save = useMutation({
    mutationFn: (id: string) => saveTeamSummary(id, drafts[id] ?? {}),
    onSuccess: () => {
      invalidate();
      cenToast.success("Đã lưu bản tổng hợp");
    },
    onError: (error: Error) => cenToast.error("Không lưu được", { description: error.message }),
  });

  const publish = useMutation({
    mutationFn: (id: string) => publishTeamSummary(id),
    onSuccess: () => {
      invalidate();
      cenToast.success("Đã phát hành tổng hợp Team");
    },
    onError: (error: Error) => cenToast.error("Không phát hành được", { description: error.message }),
  });

  const sendFeedback = useMutation({
    mutationFn: (input: { id: string; revision: boolean }) =>
      feedbackTeamSummary(input.id, input.revision, (feedback[input.id] ?? "").trim()),
    onSuccess: (_data, input) => {
      setFeedback((prev) => ({ ...prev, [input.id]: "" }));
      invalidate();
      cenToast.success("Đã gửi phản hồi");
    },
    onError: (error: Error) => cenToast.error("Không gửi được", { description: error.message }),
  });

  const rows = summaries.data ?? [];

  const setField = (id: string, key: keyof SummaryDraft, value: string, row: TeamSummaryRow) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? draftOf(row)), [key]: value } }));
  };

  return (
    <div className="grid gap-4">
      <SectionHeader
        title="Tổng hợp Team hằng tuần"
        description="Leader dựng bản nháp từ báo cáo tuần của thành viên, chỉnh sửa rồi tự phát hành. CMO phản hồi hoặc yêu cầu bổ sung."
        actions={
          access.isLeader && access.leaderTeamId ? (
            <div className="flex flex-wrap items-end gap-2">
              <FormField id="summary-week" label="Tuần bắt đầu">
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={weekStart}
                    onChange={(event) => setWeekStart(event.target.value)}
                  />
                )}
              </FormField>
              <Button size="sm" disabled={build.isPending} onClick={() => build.mutate()}>
                <RefreshCw className="size-4" /> Dựng bản nháp
              </Button>
            </div>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Chưa có bản tổng hợp"
          description="Leader dựng bản nháp cho tuần cần tổng hợp để bắt đầu."
        />
      ) : (
        rows.map((row) => {
          const draft = drafts[row.id] ?? draftOf(row);
          const isOwner = row.leader_id === access.userId;
          const editable = isOwner && row.status !== "published";
          const snapshot = row.system_snapshot as {
            obligations?: unknown[];
            sections?: unknown[];
            tasks?: unknown[];
          };
          return (
            <article key={row.id} className="rounded-lg border border-border-default bg-surface-raised p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-body font-medium text-text-primary">
                    {row.teamName ?? "Team"} — tuần {formatHanoiDate(row.week_start)}
                  </p>
                  <p className="text-body-sm text-text-tertiary">
                    Leader {row.leaderName ?? "—"} · {snapshot.sections?.length ?? 0} báo cáo tuần ·{" "}
                    {snapshot.obligations?.length ?? 0} nghĩa vụ · {snapshot.tasks?.length ?? 0} công việc
                  </p>
                </div>
                <StatusBadge label={DOC_STATUS_LABEL[row.status]} tone={DOC_STATUS_TONE[row.status]} />
              </header>

              <div className="mt-3 grid gap-3">
                <Textarea
                  rows={3}
                  disabled={!editable}
                  placeholder="Kết quả nổi bật (bắt buộc)"
                  value={draft.highlights ?? ""}
                  onChange={(event) => setField(row.id, "highlights", event.target.value, row)}
                />
                <Textarea
                  rows={2}
                  disabled={!editable}
                  placeholder="Tồn đọng"
                  value={draft.unfinished ?? ""}
                  onChange={(event) => setField(row.id, "unfinished", event.target.value, row)}
                />
                <Textarea
                  rows={2}
                  disabled={!editable}
                  placeholder="Khó khăn hoặc rủi ro"
                  value={draft.blockers ?? ""}
                  onChange={(event) => setField(row.id, "blockers", event.target.value, row)}
                />
                <Textarea
                  rows={2}
                  disabled={!editable}
                  placeholder="Ưu tiên tuần tiếp theo (bắt buộc)"
                  value={draft.next_priorities ?? ""}
                  onChange={(event) => setField(row.id, "next_priorities", event.target.value, row)}
                />
                <Textarea
                  rows={2}
                  disabled={!editable}
                  placeholder="Đề xuất hỗ trợ"
                  value={draft.support_needed ?? ""}
                  onChange={(event) => setField(row.id, "support_needed", event.target.value, row)}
                />
              </div>

              {editable ? (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={save.isPending}
                    onClick={() => save.mutate(row.id)}
                  >
                    Lưu
                  </Button>
                  <Button size="sm" disabled={publish.isPending} onClick={() => publish.mutate(row.id)}>
                    Phát hành
                  </Button>
                </div>
              ) : null}

              {access.isCmo || access.isAdmin ? (
                <div className="mt-3 border-t border-border-default pt-3">
                  <Textarea
                    rows={2}
                    placeholder="Phản hồi của CMO"
                    value={feedback[row.id] ?? ""}
                    onChange={(event) =>
                      setFeedback((prev) => ({ ...prev, [row.id]: event.target.value }))
                    }
                  />
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={sendFeedback.isPending || !(feedback[row.id] ?? "").trim()}
                      onClick={() => sendFeedback.mutate({ id: row.id, revision: false })}
                    >
                      Gửi phản hồi
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={sendFeedback.isPending || !(feedback[row.id] ?? "").trim()}
                      onClick={() => sendFeedback.mutate({ id: row.id, revision: true })}
                    >
                      Yêu cầu bổ sung
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })
      )}
    </div>
  );
}
