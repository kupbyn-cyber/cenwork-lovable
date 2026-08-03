import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { QuestionEditor, validateQuestionDrafts } from "@/components/announcement/question-editor";
import {
  createMinorRevision,
  createNewVersion,
  duplicateAnnouncement,
  revokeAnnouncement,
  setAnnouncementArchived,
  type QuestionDraft,
} from "@/lib/announcement-interaction";
import type { AnnouncementRow } from "@/lib/announcement-data";
import { hanoiToUtcISO, utcToHanoiInputs } from "@/lib/datetime";

/**
 * CEN 1.0 — M6.2 thao tác quản trị thông báo đã phát hành.
 * Chỉnh sửa nhỏ giữ nguyên xác nhận; phiên bản mới buộc xác nhận lại.
 */
interface Props {
  announcement: AnnouncementRow;
  questions: QuestionDraft[];
}

export function AnnouncementActions({ announcement, questions }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [minorOpen, setMinorOpen] = React.useState(false);
  const [versionOpen, setVersionOpen] = React.useState(false);
  const [revokeOpen, setRevokeOpen] = React.useState(false);

  const [minor, setMinor] = React.useState({ title: "", body: "", reason: "" });
  const [revokeReason, setRevokeReason] = React.useState("");
  const initialDue = utcToHanoiInputs(announcement.due_at);
  const [version, setVersion] = React.useState({
    title: announcement.title,
    body: announcement.body,
    dueDate: initialDue.date,
    dueTime: initialDue.time || "17:00",
    commentsEnabled: announcement.comments_enabled,
    reason: "",
    changeSummary: "",
    questions,
  });

  React.useEffect(() => {
    setMinor({ title: announcement.title, body: announcement.body, reason: "" });
    const due = utcToHanoiInputs(announcement.due_at);
    setVersion((prev) => ({
      ...prev,
      title: announcement.title,
      body: announcement.body,
      dueDate: due.date,
      dueTime: due.time || "17:00",
      commentsEnabled: announcement.comments_enabled,
      questions,
    }));
  }, [announcement, questions]);

  function refresh() {
    for (const key of [
      "announcement",
      "announcement-recipients",
      "announcement-versions",
      "announcement-revisions",
      "announcement-survey",
      "announcement-inbox",
      "announcements-created",
      "announcement-overdue",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  const minorMutation = useMutation({
    mutationFn: () =>
      createMinorRevision({
        announcementId: announcement.id,
        title: minor.title,
        body: minor.body,
        reason: minor.reason,
      }),
    onSuccess: () => {
      setMinorOpen(false);
      refresh();
      toast.success("Đã lưu chỉnh sửa nhỏ, người nhận không phải xác nhận lại");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const versionMutation = useMutation({
    mutationFn: () =>
      createNewVersion({
        announcementId: announcement.id,
        title: version.title,
        body: version.body,
        dueAt: hanoiToUtcISO(version.dueDate, version.dueTime || "00:00")!,
        commentsEnabled: version.commentsEnabled,
        resultVisibility: announcement.result_visibility,
        reason: version.reason,
        changeSummary: version.changeSummary,
        questions: version.questions,
      }),
    onSuccess: () => {
      setVersionOpen(false);
      refresh();
      toast.success("Đã phát hành phiên bản mới, người nhận cần xác nhận lại");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeAnnouncement(announcement.id, revokeReason),
    onSuccess: () => {
      setRevokeOpen(false);
      refresh();
      toast.success("Đã thu hồi thông báo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: () => setAnnouncementArchived(announcement.id, !announcement.archived_at),
    onSuccess: () => {
      refresh();
      toast.success(announcement.archived_at ? "Đã bỏ lưu trữ" : "Đã lưu trữ thông báo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateAnnouncement(announcement.id),
    onSuccess: (id) => {
      refresh();
      toast.success("Đã nhân bản thành bản nháp mới");
      void navigate({
        to: "/announcements/$announcementId",
        params: { announcementId: id },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoked = Boolean(announcement.revoked_at);

  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {!revoked ? (
        <>
          <Button variant="secondary" size="sm" onClick={() => setMinorOpen(true)}>
            Chỉnh sửa nhỏ
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setVersionOpen(true)}>
            Phiên bản mới
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRevokeOpen(true)}>
            Thu hồi
          </Button>
        </>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        loading={archiveMutation.isPending}
        onClick={() => archiveMutation.mutate()}
      >
        {announcement.archived_at ? "Bỏ lưu trữ" : "Lưu trữ"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        loading={duplicateMutation.isPending}
        onClick={() => duplicateMutation.mutate()}
      >
        Nhân bản
      </Button>

      <Modal
        open={minorOpen}
        onOpenChange={setMinorOpen}
        title="Chỉnh sửa nhỏ"
        description="Chỉ dùng cho sửa lỗi chính tả hoặc làm rõ câu chữ. Người nhận giữ nguyên xác nhận."
        footer={
          <Button
            loading={minorMutation.isPending}
            disabled={!minor.title.trim() || !minor.body.trim() || !minor.reason.trim()}
            onClick={() => minorMutation.mutate()}
          >
            Lưu chỉnh sửa
          </Button>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <FormField id="minor-title" label="Tiêu đề" required>
            {(props) => (
              <Input
                {...props}
                value={minor.title}
                maxLength={200}
                onChange={(event) => setMinor((prev) => ({ ...prev, title: event.target.value }))}
              />
            )}
          </FormField>
          <FormField id="minor-body" label="Nội dung" required>
            {(props) => (
              <Textarea
                {...props}
                rows={8}
                value={minor.body}
                maxLength={20000}
                onChange={(event) => setMinor((prev) => ({ ...prev, body: event.target.value }))}
              />
            )}
          </FormField>
          <FormField id="minor-reason" label="Lý do chỉnh sửa" required>
            {(props) => (
              <Input
                {...props}
                value={minor.reason}
                maxLength={300}
                onChange={(event) => setMinor((prev) => ({ ...prev, reason: event.target.value }))}
              />
            )}
          </FormField>
        </div>
      </Modal>

      <Modal
        open={versionOpen}
        onOpenChange={setVersionOpen}
        title="Phát hành phiên bản mới"
        description="Nội dung quan trọng thay đổi. Tất cả người nhận sẽ phải xác nhận lại từ đầu."
        footer={
          <Button
            loading={versionMutation.isPending}
            disabled={
              !version.title.trim() ||
              !version.body.trim() ||
              !version.dueDate ||
              !version.reason.trim() ||
              !version.changeSummary.trim()
            }
            onClick={() => {
              const message = validateQuestionDrafts(version.questions);
              if (message) {
                toast.error(message);
                return;
              }
              const dueAt = hanoiToUtcISO(version.dueDate, version.dueTime || "00:00");
              if (!dueAt || new Date(dueAt).getTime() <= Date.now()) {
                toast.error("Hạn xác nhận mới phải ở tương lai.");
                return;
              }
              versionMutation.mutate();
            }}
          >
            Phát hành phiên bản {announcement.current_version + 1}
          </Button>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <FormField id="ver-title" label="Tiêu đề" required>
            {(props) => (
              <Input
                {...props}
                value={version.title}
                maxLength={200}
                onChange={(event) => setVersion((prev) => ({ ...prev, title: event.target.value }))}
              />
            )}
          </FormField>
          <FormField id="ver-body" label="Nội dung" required>
            {(props) => (
              <Textarea
                {...props}
                rows={8}
                value={version.body}
                maxLength={20000}
                onChange={(event) => setVersion((prev) => ({ ...prev, body: event.target.value }))}
              />
            )}
          </FormField>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField id="ver-date" label="Hạn xác nhận mới" required>
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={version.dueDate}
                  onChange={(event) =>
                    setVersion((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField id="ver-time" label="Giờ" required>
              {(props) => (
                <Input
                  {...props}
                  type="time"
                  value={version.dueTime}
                  onChange={(event) =>
                    setVersion((prev) => ({ ...prev, dueTime: event.target.value }))
                  }
                />
              )}
            </FormField>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Checkbox
              id="ver-comments"
              checked={version.commentsEnabled}
              onCheckedChange={(checked) =>
                setVersion((prev) => ({ ...prev, commentsEnabled: checked === true }))
              }
            />
            <Label htmlFor="ver-comments">Cho phép bình luận</Label>
          </div>
          <FormField id="ver-reason" label="Lý do tạo phiên bản mới" required>
            {(props) => (
              <Input
                {...props}
                value={version.reason}
                maxLength={300}
                onChange={(event) =>
                  setVersion((prev) => ({ ...prev, reason: event.target.value }))
                }
              />
            )}
          </FormField>
          <FormField id="ver-summary" label="Tóm tắt thay đổi gửi tới người nhận" required>
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={version.changeSummary}
                maxLength={1000}
                onChange={(event) =>
                  setVersion((prev) => ({ ...prev, changeSummary: event.target.value }))
                }
              />
            )}
          </FormField>
          <QuestionEditor
            value={version.questions}
            onChange={(next) => setVersion((prev) => ({ ...prev, questions: next }))}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="Thu hồi thông báo"
        description="Thông báo dừng hiệu lực, không còn tính quá hạn và không khóa thao tác của người nhận."
        tone="destructive"
        confirmLabel="Thu hồi"
        loading={revokeMutation.isPending}
        confirmDisabled={!revokeReason.trim()}
        onConfirm={() => revokeMutation.mutate()}
      >
        <Input
          value={revokeReason}
          maxLength={300}
          aria-label="Lý do thu hồi"
          placeholder="Lý do thu hồi (bắt buộc)"
          onChange={(event) => setRevokeReason(event.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
