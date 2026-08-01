import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useAnnouncementLock } from "@/hooks/use-announcement-lock";
import {
  RecipientPicker,
  useRecipientScope,
} from "@/components/announcement/recipient-picker";
import {
  announcementTargetsQuery,
  saveDraft,
  type AnnouncementRow,
} from "@/lib/announcement-data";
import { publishAnnouncement } from "@/lib/announcement.functions";
import { hanoiToUtcISO, utcToHanoiInputs } from "@/lib/datetime";

/**
 * CEN 1.0 — M6.1 soạn thông báo nội bộ.
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
}

const EMPTY: FormState = {
  title: "",
  body: "",
  dueDate: "",
  dueTime: "17:00",
  userIds: [],
  teamIds: [],
};

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

  React.useEffect(() => {
    if (!open) return;
    const due = utcToHanoiInputs(announcement?.due_at ?? null);
    setError(null);
    setState({
      title: announcement?.title ?? "",
      body: announcement?.body ?? "",
      dueDate: due.date,
      dueTime: due.time || "17:00",
      userIds: (targets.data ?? [])
        .filter((row) => row.target_type === "user")
        .map((row) => row.target_id),
      teamIds: (targets.data ?? [])
        .filter((row) => row.target_type === "team")
        .map((row) => row.target_id),
    });
  }, [open, announcement, targets.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["announcements-created"] });
    void queryClient.invalidateQueries({ queryKey: ["announcement-inbox"] });
    if (announcement?.id) {
      void queryClient.invalidateQueries({ queryKey: ["announcement", announcement.id] });
      void queryClient.invalidateQueries({ queryKey: ["announcement-targets", announcement.id] });
    }
  }

  const dueAt = state.dueDate ? hanoiToUtcISO(state.dueDate, state.dueTime || "00:00") : null;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...(announcement?.id ? { id: announcement.id } : {}),
        title: state.title.trim(),
        body: state.body,
        dueAt,
        userIds: state.userIds,
        teamIds: state.teamIds,
      };
      return saveDraft(payload, user!.id);
    },
    onSuccess: (id) => {
      refresh();
      toast.success("Đã lưu bản nháp");
      onSaved?.(id);
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const id = await saveDraft(
        {
          ...(announcement?.id ? { id: announcement.id } : {}),
          title: state.title.trim(),
          body: state.body,
          dueAt,
          userIds: state.userIds,
          teamIds: state.teamIds,
        },
        user!.id,
      );
      await publishAnnouncement({ data: { announcementId: id } });
      return id;
    },
    onSuccess: (id) => {
      refresh();
      toast.success("Đã phát hành thông báo");
      onSaved?.(id);
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  function validatePublish(): string | null {
    if (!state.title.trim()) return "Phải nhập tiêu đề.";
    if (!state.body.trim()) return "Phải nhập nội dung.";
    if (state.userIds.length === 0 && state.teamIds.length === 0) {
      return "Phải chọn ít nhất một người nhận.";
    }
    if (!dueAt) return "Phải đặt hạn xác nhận.";
    if (new Date(dueAt).getTime() <= Date.now()) return "Hạn xác nhận phải ở tương lai.";
    return null;
  }

  const busy = save.isPending || publish.isPending;

  return (
    <DrawerPanel
      open={open}
      onOpenChange={onOpenChange}
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

        <RecipientPicker
          scope={scope}
          userIds={state.userIds}
          teamIds={state.teamIds}
          disabled={busy}
          onChange={(next) => setState((prev) => ({ ...prev, ...next }))}
        />
      </div>
    </DrawerPanel>
  );
}
