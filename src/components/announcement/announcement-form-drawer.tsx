import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormModal } from "@/components/ui/form-modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useAnnouncementLock } from "@/hooks/use-announcement-lock";
import {
  RecipientPicker,
  useRecipientScope,
} from "@/components/announcement/recipient-picker";
import {
  QuestionEditor,
  validateQuestionDrafts,
} from "@/components/announcement/question-editor";
import {
  announcementTargetsQuery,
  RESULT_VISIBILITY_LABEL,
  saveDraft,
  type AnnouncementRow,
  type ResultVisibility,
} from "@/lib/announcement-data";
import {
  replaceDraftQuestions,
  surveyQuery,
  type QuestionDraft,
} from "@/lib/announcement-interaction";
import {
  estimateAnnouncementRecipients,
  publishAnnouncement,
} from "@/lib/announcement.functions";
import { hanoiToUtcISO, utcToHanoiInputs } from "@/lib/datetime";

/**
 * CEN 1.0 — M6.1/M6.2 soạn thông báo nội bộ.
 * Nháp có thể chưa hoàn chỉnh; phát hành mới bắt buộc đủ tiêu đề, nội dung,
 * người nhận hợp lệ và hạn xác nhận ở tương lai.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement?: AnnouncementRow | null;
  onSaved?: (id: string) => void;
}

interface FormState {
  title: string;
  body: string;
  dueDate: string;
  dueTime: string;
  userIds: string[];
  teamIds: string[];
  commentsEnabled: boolean;
  resultVisibility: ResultVisibility;
  questions: QuestionDraft[];
  allUsers: boolean;
  allTeams: boolean;
  includeSelf: boolean;
}

const EMPTY: FormState = {
  title: "",
  body: "",
  dueDate: "",
  dueTime: "17:00",
  userIds: [],
  teamIds: [],
  commentsEnabled: true,
  resultVisibility: "none",
  questions: [],
  allUsers: false,
  allTeams: false,
  includeSelf: false,
};

const VISIBILITY_OPTIONS: ResultVisibility[] = ["none", "after_submit", "after_due"];

export function AnnouncementFormDrawer({ open, onOpenChange, announcement, onSaved }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scope = useRecipientScope();
  const { locked } = useAnnouncementLock();
  const [state, setState] = React.useState<FormState>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);

  const targets = useQuery({
    ...announcementTargetsQuery(announcement?.id ?? ""),
    enabled: open && Boolean(announcement?.id),
  });

  const survey = useQuery({
    ...surveyQuery(announcement?.id ?? "", 1),
    enabled: open && Boolean(announcement?.id),
  });

  // Số người nhận dự kiến được tính ở server theo quyền thật; không tải toàn bộ User về client.
  const estimate = useQuery({
    queryKey: [
      "announcement-recipient-estimate",
      state.userIds,
      state.teamIds,
      state.allUsers,
      state.allTeams,
      state.includeSelf,
    ],
    queryFn: () =>
      estimateAnnouncementRecipients({
        data: {
          userIds: state.userIds,
          teamIds: state.teamIds,
          allUsers: state.allUsers,
          allTeams: state.allTeams,
          includeSelf: state.includeSelf,
        },
      }),
    enabled: open,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!open) return;
    const due = utcToHanoiInputs(announcement?.due_at ?? null);
    const questions: QuestionDraft[] = (survey.data?.questions ?? []).map((question) => ({
      type: question.question_type,
      content: question.content,
      required: question.is_required,
      min: question.min_select,
      max: question.max_select,
      options: (survey.data?.options ?? [])
        .filter((option) => option.question_id === question.id)
        .map((option) => option.label),
    }));
    setError(null);
    setState({
      title: announcement?.title ?? "",
      body: announcement?.body ?? "",
      dueDate: due.date,
      dueTime: due.time || "17:00",
      commentsEnabled: announcement?.comments_enabled ?? true,
      resultVisibility: announcement?.result_visibility ?? "none",
      questions,
      allUsers: announcement?.audience_all_users ?? false,
      allTeams: announcement?.audience_all_teams ?? false,
      includeSelf: announcement?.include_self ?? false,
      userIds: (targets.data ?? [])
        .filter((row) => row.target_type === "user")
        .map((row) => row.target_id),
      teamIds: (targets.data ?? [])
        .filter((row) => row.target_type === "team")
        .map((row) => row.target_id),
    });
  }, [open, announcement, targets.data, survey.data]);

  function refresh(id?: string) {
    void queryClient.invalidateQueries({ queryKey: ["announcements-created"] });
    void queryClient.invalidateQueries({ queryKey: ["announcement-inbox"] });
    const key = id ?? announcement?.id;
    if (key) {
      void queryClient.invalidateQueries({ queryKey: ["announcement", key] });
      void queryClient.invalidateQueries({ queryKey: ["announcement-targets", key] });
      void queryClient.invalidateQueries({ queryKey: ["announcement-survey", key] });
    }
  }

  const dueAt = state.dueDate ? hanoiToUtcISO(state.dueDate, state.dueTime || "00:00") : null;

  async function persist(): Promise<string> {
    const id = await saveDraft(
      {
        ...(announcement?.id ? { id: announcement.id } : {}),
        title: state.title.trim(),
        body: state.body,
        dueAt,
        userIds: state.userIds,
        teamIds: state.teamIds,
        commentsEnabled: state.commentsEnabled,
        resultVisibility: state.resultVisibility,
        allUsers: state.allUsers,
        allTeams: state.allTeams,
        includeSelf: state.includeSelf,
      },
      user!.id,
    );
    await replaceDraftQuestions(id, state.questions);
    return id;
  }

  const save = useMutation({
    mutationFn: persist,
    onSuccess: (id) => {
      refresh(id);
      toast.success("Đã lưu bản nháp");
      onSaved?.(id);
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const id = await persist();
      await publishAnnouncement({ data: { announcementId: id } });
      return id;
    },
    onSuccess: (id) => {
      refresh(id);
      toast.success("Đã phát hành thông báo");
      onSaved?.(id);
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  function validatePublish(): string | null {
    if (!state.title.trim()) return "Phải nhập tiêu đề.";
    if (!state.body.trim()) return "Phải nhập nội dung.";
    if (
      state.userIds.length === 0 &&
      state.teamIds.length === 0 &&
      !state.allUsers &&
      !state.allTeams &&
      !state.includeSelf
    ) {
      return "Phải chọn ít nhất một người nhận.";
    }
    if (!dueAt) return "Phải đặt hạn xác nhận.";
    if (new Date(dueAt).getTime() <= Date.now()) return "Hạn xác nhận phải ở tương lai.";
    return validateQuestionDrafts(state.questions);
  }

  const busy = save.isPending || publish.isPending;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      busy={busy}
      dirty={
        !announcement?.id &&
        Boolean(
          state.title.trim() ||
            state.body.trim() ||
            state.userIds.length ||
            state.teamIds.length ||
            state.questions.length ||
            state.allUsers ||
            state.allTeams,
        )
      }
      title={announcement?.id ? "Sửa bản nháp" : "Soạn thông báo nội bộ"}
      description="Nội dung văn bản thuần. Đường dẫn sẽ tự nhận diện và mở tab mới."
      footer={
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || locked}
            loading={save.isPending}
            onClick={() => {
              const message = validateQuestionDrafts(state.questions);
              if (message) {
                setError(message);
                return;
              }
              setError(null);
              save.mutate();
            }}
          >
            Lưu nháp
          </Button>
          <Button
            type="button"
            disabled={busy || locked}
            loading={publish.isPending}
            onClick={() => {
              const message = validatePublish();
              if (message) {
                setError(message);
                return;
              }
              setError(null);
              publish.mutate();
            }}
          >
            Phát hành
          </Button>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        {locked ? (
          <p className="rounded-control border border-state-danger/50 bg-state-danger/10 p-3 text-body-sm text-text-primary">
            Bạn đang bị giới hạn thao tác vì còn thông báo nội bộ quá hạn chưa xác nhận.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-body-sm text-state-danger">
            {error}
          </p>
        ) : null}

        <FormField id="ann-title" label="Tiêu đề" required>
          {(props) => (
            <Input
              {...props}
              value={state.title}
              maxLength={200}
              disabled={busy}
              onChange={(event) => setState((prev) => ({ ...prev, title: event.target.value }))}
            />
          )}
        </FormField>

        <FormField id="ann-body" label="Nội dung" required>
          {(props) => (
            <Textarea
              {...props}
              rows={8}
              value={state.body}
              maxLength={20000}
              disabled={busy}
              onChange={(event) => setState((prev) => ({ ...prev, body: event.target.value }))}
            />
          )}
        </FormField>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField id="ann-due-date" label="Hạn xác nhận" required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={state.dueDate}
                disabled={busy}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, dueDate: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField id="ann-due-time" label="Giờ" required>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={state.dueTime}
                disabled={busy}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, dueTime: event.target.value }))
                }
              />
            )}
          </FormField>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Checkbox
            id="ann-comments"
            checked={state.commentsEnabled}
            disabled={busy}
            onCheckedChange={(checked) =>
              setState((prev) => ({ ...prev, commentsEnabled: checked === true }))
            }
          />
          <Label htmlFor="ann-comments">Cho phép bình luận</Label>
        </div>

        <FormField id="ann-visibility" label="Công khai kết quả khảo sát">
          {(props) => (
            <select
              {...props}
              value={state.resultVisibility}
              disabled={busy}
              onChange={(event) =>
                setState((prev) => ({
                  ...prev,
                  resultVisibility: event.target.value as ResultVisibility,
                }))
              }
              className="h-10 w-full rounded-control border border-border-default bg-surface-raised px-3 text-body-sm text-text-primary cen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {RESULT_VISIBILITY_LABEL[option]}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <QuestionEditor
          value={state.questions}
          disabled={busy}
          onChange={(questions) => setState((prev) => ({ ...prev, questions }))}
        />

        <RecipientPicker
          scope={scope}
          userIds={state.userIds}
          teamIds={state.teamIds}
          bulk={{
            allUsers: state.allUsers,
            allTeams: state.allTeams,
            includeSelf: state.includeSelf,
          }}
          estimatedCount={estimate.data?.count ?? null}
          estimating={estimate.isFetching}
          disabled={busy}
          onChange={(next) => setState((prev) => ({ ...prev, ...next }))}
          onBulkChange={(next) => setState((prev) => ({ ...prev, ...next }))}
        />
      </div>
    </DrawerPanel>
  );
}
