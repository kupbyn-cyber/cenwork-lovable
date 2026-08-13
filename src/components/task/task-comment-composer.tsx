import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  postTaskComment,
  taskMentionCandidatesQuery,
  type MentionCandidate,
} from "@/lib/task-comment-data";

/**
 * TASK-QUICKVIEW-01 — ô nhập bình luận có @mention.
 * Mention chỉ hợp lệ khi người dùng chọn đúng nhân sự trong dropdown; chuỗi tự gõ
 * không được coi là mention. Danh sách ứng viên do backend lọc theo quyền xem Task.
 */
const TRIGGER = /(^|\s)@([\p{L}\p{N}\s._-]{0,30})$/u;

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export interface TaskCommentComposerProps {
  taskId: string;
  onPosted?: () => void;
  rows?: number;
  className?: string;
}

export function TaskCommentComposer({
  taskId,
  onPosted,
  rows = 3,
  className,
}: TaskCommentComposerProps) {
  const queryClient = useQueryClient();
  const [body, setBody] = React.useState("");
  const [query, setQuery] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const [picked, setPicked] = React.useState<MentionCandidate[]>([]);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

  const candidates = useQuery(taskMentionCandidatesQuery(taskId, query !== null));
  const options = React.useMemo(() => {
    if (query === null) return [];
    const q = normalize(query.trim());
    const rows_ = candidates.data ?? [];
    return (q === "" ? rows_ : rows_.filter((row) => normalize(row.display_name).includes(q))).slice(
      0,
      8,
    );
  }, [candidates.data, query]);

  React.useEffect(() => setActive(0), [query]);

  /** Mention hợp lệ = đã chọn từ dropdown và tên vẫn còn trong nội dung. */
  const mentionIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const person of picked) {
      if (body.includes(`@${person.display_name}`)) ids.add(person.id);
    }
    return Array.from(ids);
  }, [picked, body]);

  function handleChange(value: string) {
    setBody(value);
    const caret = inputRef.current?.selectionStart ?? value.length;
    const match = TRIGGER.exec(value.slice(0, caret));
    setQuery(match ? match[2] : null);
  }

  function choose(person: MentionCandidate) {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const match = TRIGGER.exec(before);
    if (!match) return;
    const start = before.length - match[0].length + match[1].length;
    const next = `${body.slice(0, start)}@${person.display_name} ${body.slice(caret)}`;
    setBody(next);
    setPicked((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, person]));
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = start + person.display_name.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  const create = useMutation({
    mutationFn: () => postTaskComment(taskId, body, mentionIds),
    onSuccess: () => {
      setBody("");
      setPicked([]);
      setQuery(null);
      void queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
      toast.success("Đã gửi bình luận.");
      onPosted?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const open = query !== null && (options.length > 0 || candidates.isLoading);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Textarea
          ref={inputRef}
          value={body}
          rows={rows}
          placeholder="Nhập bình luận… gõ @ để nhắc tên"
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (!open) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => (i + 1) % Math.max(options.length, 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => (i - 1 + options.length) % Math.max(options.length, 1));
            } else if (event.key === "Enter" && options[active]) {
              event.preventDefault();
              choose(options[active]);
            } else if (event.key === "Escape") {
              setQuery(null);
            }
          }}
        />
        {open ? (
          <div className="absolute bottom-full left-0 z-50 mb-1 max-h-56 w-full max-w-xs overflow-auto rounded-card border border-border-default bg-surface-raised p-1 shadow-lg">
            {candidates.isLoading ? (
              <p className="px-2 py-1.5 text-caption text-text-muted">Đang tải danh sách…</p>
            ) : options.length === 0 ? (
              <p className="px-2 py-1.5 text-caption text-text-muted">Không tìm thấy nhân sự.</p>
            ) : (
              options.map((person, index) => (
                <button
                  key={person.id}
                  type="button"
                  className={cn(
                    "block w-full truncate rounded-md px-2 py-1.5 text-left text-body-sm",
                    index === active
                      ? "bg-surface-subtle text-text-primary"
                      : "text-text-secondary",
                  )}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(person);
                  }}
                >
                  @{person.display_name}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-text-muted">
          {mentionIds.length > 0 ? `Nhắc tên: ${mentionIds.length} người` : "Gõ @ để nhắc tên"}
        </span>
        <Button
          size="sm"
          disabled={body.trim() === ""}
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          Gửi bình luận
        </Button>
      </div>
    </div>
  );
}
