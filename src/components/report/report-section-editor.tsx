import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  addTaskLink,
  removeLink,
  saveSection,
  type ReportDocRow,
  type ReportLinkRow,
  type ReportSectionRow,
  type SuggestedSource,
} from "@/lib/report-workflow-data";

/**
 * CEN 1.0 — REPORT-02: soạn nội dung báo cáo theo từng Team.
 * Trường bắt buộc do database chốt khi gửi; UI chỉ nhắc trước để đỡ mất công.
 */
type SectionDraft = Pick<
  ReportSectionRow,
  | "done_work"
  | "results"
  | "unfinished"
  | "blockers"
  | "next_plan"
  | "support_needed"
  | "no_work_flag"
  | "no_work_reason"
  | "no_backlog_flag"
>;

function toDraft(section: ReportSectionRow): SectionDraft {
  return {
    done_work: section.done_work,
    results: section.results,
    unfinished: section.unfinished,
    blockers: section.blockers,
    next_plan: section.next_plan,
    support_needed: section.support_needed,
    no_work_flag: section.no_work_flag,
    no_work_reason: section.no_work_reason,
    no_backlog_flag: section.no_backlog_flag,
  };
}

export interface ReportSectionEditorProps {
  report: ReportDocRow;
  section: ReportSectionRow;
  links: ReportLinkRow[];
  suggestions: SuggestedSource[];
  editable: boolean;
}

export function ReportSectionEditor({
  report,
  section,
  links,
  suggestions,
  editable,
}: ReportSectionEditorProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<SectionDraft>(() => toDraft(section));
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setDraft(toDraft(section));
    setDirty(false);
  }, [section]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["report-sections", report.id] });
    void queryClient.invalidateQueries({ queryKey: ["report-links", report.id] });
  };

  const save = useMutation({
    mutationFn: () => saveSection(section.id, draft),
    onSuccess: () => {
      setDirty(false);
      invalidate();
      cenToast.success("Đã lưu nội dung");
    },
    onError: (error: Error) => cenToast.error("Không lưu được", { description: error.message }),
  });

  const attach = useMutation({
    mutationFn: (taskId: string) =>
      addTaskLink({ reportId: report.id, sectionId: section.id, taskId, summary: null }),
    onSuccess: () => invalidate(),
    onError: (error: Error) => cenToast.error("Không gắn được công việc", { description: error.message }),
  });

  const detach = useMutation({
    mutationFn: (linkId: string) => removeLink(linkId),
    onSuccess: () => invalidate(),
    onError: (error: Error) => cenToast.error("Không gỡ được", { description: error.message }),
  });

  const set = <K extends keyof SectionDraft>(key: K, value: SectionDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const sectionLinks = links.filter((link) => link.section_id === section.id);
  const attachedTaskIds = new Set(sectionLinks.map((link) => link.task_id));
  const openSuggestions = suggestions.filter(
    (item) => !attachedTaskIds.has(item.id) && (!section.team_id || !item.team_id || item.team_id === section.team_id),
  );

  const isDaily = report.report_type === "daily";
  const isWeekly = report.report_type === "weekly";

  return (
    <section className="rounded-lg border border-border-default bg-surface-raised p-4">
      <SectionHeader
        title={section.teamName ? `Team ${section.teamName}` : "Nội dung báo cáo"}
        description={
          isWeekly
            ? "Kết quả quan trọng và ưu tiên tuần tiếp theo là bắt buộc."
            : isDaily
              ? "Công việc đã thực hiện, kết quả và kế hoạch tiếp theo là bắt buộc."
              : "Kết quả hoặc tiến độ và kế hoạch tiếp theo là bắt buộc."
        }
      />

      <label className="mt-3 flex items-center justify-between gap-3 text-body text-text-secondary">
        Không phát sinh công việc trong kỳ
        <Switch
          checked={draft.no_work_flag}
          disabled={!editable}
          aria-label="Không phát sinh công việc"
          onCheckedChange={(value) => set("no_work_flag", value)}
        />
      </label>

      {draft.no_work_flag ? (
        <Textarea
          className="mt-3"
          rows={3}
          disabled={!editable}
          placeholder="Lý do không phát sinh công việc (bắt buộc)"
          value={draft.no_work_reason ?? ""}
          onChange={(event) => set("no_work_reason", event.target.value)}
        />
      ) : (
        <div className="mt-3 grid gap-3">
          {isDaily ? (
            <Textarea
              rows={3}
              disabled={!editable}
              placeholder="Công việc đã thực hiện"
              value={draft.done_work ?? ""}
              onChange={(event) => set("done_work", event.target.value)}
            />
          ) : null}
          <Textarea
            rows={3}
            disabled={!editable}
            placeholder={isWeekly ? "Kết quả quan trọng" : "Kết quả hoặc tiến độ"}
            value={draft.results ?? ""}
            onChange={(event) => set("results", event.target.value)}
          />
          {isWeekly ? (
            <label className="flex items-center justify-between gap-3 text-body text-text-secondary">
              Không có tồn đọng
              <Switch
                checked={draft.no_backlog_flag}
                disabled={!editable}
                aria-label="Không có tồn đọng"
                onCheckedChange={(value) => set("no_backlog_flag", value)}
              />
            </label>
          ) : null}
          {!(isWeekly && draft.no_backlog_flag) ? (
            <Textarea
              rows={2}
              disabled={!editable}
              placeholder="Nội dung chưa hoàn thành"
              value={draft.unfinished ?? ""}
              onChange={(event) => set("unfinished", event.target.value)}
            />
          ) : null}
          <Textarea
            rows={2}
            disabled={!editable}
            placeholder="Khó khăn hoặc rủi ro"
            value={draft.blockers ?? ""}
            onChange={(event) => set("blockers", event.target.value)}
          />
          <Textarea
            rows={2}
            disabled={!editable}
            placeholder={isWeekly ? "Ưu tiên tuần tiếp theo" : "Kế hoạch tiếp theo"}
            value={draft.next_plan ?? ""}
            onChange={(event) => set("next_plan", event.target.value)}
          />
          <Textarea
            rows={2}
            disabled={!editable}
            placeholder="Đề xuất hoặc cần hỗ trợ"
            value={draft.support_needed ?? ""}
            onChange={(event) => set("support_needed", event.target.value)}
          />
        </div>
      )}

      {editable ? (
        <div className="mt-3 flex justify-end">
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            Lưu nội dung
          </Button>
        </div>
      ) : null}

      <div className="mt-4 border-t border-border-default pt-3">
        <p className="text-body-sm font-medium text-text-primary">Nguồn tham chiếu</p>
        {sectionLinks.length === 0 ? (
          <p className="mt-1 text-body-sm text-text-tertiary">Chưa gắn công việc hoặc dự án nào.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {sectionLinks.map((link) => {
              const snapshot = link.snapshot as { name?: string; status?: string };
              return (
                <li
                  key={link.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border-default px-3 py-2"
                >
                  <span className="min-w-0 truncate text-body-sm text-text-secondary">
                    {snapshot.name ?? link.summary ?? link.task_id ?? link.project_id}
                    {link.snapshot_version > 0 ? (
                      <span className="ml-2 text-caption text-text-tertiary">
                        bản chụp v{link.snapshot_version}
                      </span>
                    ) : null}
                  </span>
                  {editable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Gỡ nguồn tham chiếu"
                      disabled={detach.isPending}
                      onClick={() => detach.mutate(link.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {editable && openSuggestions.length > 0 ? (
          <div className="mt-3">
            <p className="text-body-sm text-text-tertiary">Gợi ý từ công việc có hoạt động trong kỳ</p>
            <ul className="mt-2 grid gap-2">
              {openSuggestions.slice(0, 8).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border-subtle px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm text-text-primary">{item.name}</span>
                    <span className="block text-caption text-text-tertiary">
                      {item.project_name ?? "Không thuộc dự án"}
                      {item.deadline ? ` — hạn ${formatHanoiDateTime(item.deadline)}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge label={item.status} tone="neutral" />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={attach.isPending}
                      onClick={() => attach.mutate(item.id)}
                    >
                      <Plus className="size-4" /> Gắn
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
