import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  CheckSquare,
  FileText,
  FolderKanban,
  Search,
  Users,
  X,
} from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { EntityAvatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { avatarUrlMapQuery } from "@/lib/avatar-data";
import { cn } from "@/lib/utils";
import {
  SEARCH_GROUP_LABEL,
  SEARCH_MIN_LENGTH,
  globalSearchQuery,
  type SearchGroupKey,
  type SearchHit,
} from "@/lib/search-data";

/**
 * SEARCH-01 — Tìm kiếm toàn hệ thống trên header.
 * Chỉ hiển thị và điều hướng: phạm vi dữ liệu do RLS/RPC quyết định,
 * trang đích vẫn tự kiểm tra quyền như trước.
 */
const GROUP_ICON: Record<SearchGroupKey, React.ComponentType<{ className?: string }>> = {
  projects: FolderKanban,
  tasks: CheckSquare,
  members: Users,
  documents: FileText,
  messages: BellRing,
};

const PLACEHOLDER = "Tìm dự án, công việc, tài liệu…";

function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface ResultsProps {
  term: string;
  onNavigate: (hit: SearchHit) => void;
}

function SearchResultsPanel({ term, onNavigate }: ResultsProps) {
  const trimmed = term.trim();
  const result = useQuery(globalSearchQuery(trimmed));

  const avatarPaths = React.useMemo(() => {
    const hits = result.data?.groups.find((group) => group.group === "members")?.hits ?? [];
    return hits.map((hit) => hit.avatarPath).filter((path): path is string => Boolean(path));
  }, [result.data]);
  const avatarMap = useQuery(avatarUrlMapQuery(avatarPaths));

  if (trimmed.length < SEARCH_MIN_LENGTH) {
    return (
      <p className="px-4 py-6 text-center text-caption text-text-muted">
        Nhập ít nhất {SEARCH_MIN_LENGTH} ký tự để tìm kiếm.
      </p>
    );
  }

  if (result.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-6 text-caption text-text-muted">
        <Spinner size="sm" />
        Đang tìm kiếm…
      </div>
    );
  }

  if (result.isError) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <p className="text-caption text-text-muted">Không tải được kết quả tìm kiếm.</p>
        <Button size="sm" variant="secondary" type="button" onClick={() => void result.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  if (!result.data || result.data.total === 0) {
    return (
      <p className="px-4 py-6 text-center text-caption text-text-muted">
        Không tìm thấy kết quả phù hợp.
      </p>
    );
  }

  return (
    <div className="py-1">
      {result.data.groups.map(({ group, hits }) => {
        const Icon = GROUP_ICON[group];
        return (
          <section key={group} className="py-1">
            <p className="px-3 py-1 text-caption font-semibold tracking-wide text-text-muted uppercase">
              {SEARCH_GROUP_LABEL[group]}
            </p>
            <ul>
              {hits.map((hit) => (
                <li key={hit.key}>
                  <button
                    type="button"
                    onClick={() => onNavigate(hit)}
                    className="flex w-full min-w-0 items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                  >
                    {group === "members" ? (
                      <EntityAvatar
                        name={hit.title}
                        size="sm"
                        {...(hit.avatarPath && avatarMap.data?.[hit.avatarPath]
                          ? { src: avatarMap.data[hit.avatarPath] as string }
                          : {})}
                      />
                    ) : (
                      <span className="mt-0.5 flex size-icon-lg shrink-0 items-center justify-center rounded-control bg-surface text-text-muted">
                        <Icon className="size-icon-sm" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label font-medium text-text-primary">
                        {hit.title}
                      </span>
                      {hit.meta.length > 0 ? (
                        <span className="block truncate text-caption text-text-muted">
                          {hit.meta.join(" · ")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [value, setValue] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const term = useDebounced(value);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const go = React.useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      setMobileOpen(false);
      switch (hit.group) {
        case "projects":
          void navigate({ to: "/projects/$projectId", params: { projectId: hit.id } });
          break;
        case "tasks":
          void navigate({ to: "/tasks/$taskId", params: { taskId: hit.id } });
          break;
        case "documents":
          void navigate({ to: "/documents/$documentId", params: { documentId: hit.id } });
          break;
        case "members":
          void navigate({ to: "/members", search: { member: hit.id } });
          break;
        case "messages":
          if (hit.kind === "approval") {
            void navigate({ to: "/approvals/$approvalId", params: { approvalId: hit.id } });
          } else {
            void navigate({
              to: "/announcements/$announcementId",
              params: { announcementId: hit.id },
            });
          }
          break;
      }
    },
    [navigate],
  );

  return (
    <>
      {/* Mobile: nút mở panel toàn màn hình. */}
      <IconButton
        variant="ghost"
        size="icon"
        type="button"
        className="sm:hidden"
        label="Tìm kiếm"
        onClick={() => setMobileOpen(true)}
      >
        <Search />
      </IconButton>

      {/* Desktop / Tablet: ô tìm kiếm tại chỗ + bảng kết quả bên dưới. */}
      <div ref={containerRef} className="relative hidden min-w-0 flex-1 sm:block">
        <label className="relative block max-w-md">
          <span className="sr-only">Tìm kiếm trong hệ thống</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-icon-md -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={value}
            placeholder={PLACEHOLDER}
            onChange={(event) => {
              setValue(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter") event.preventDefault();
            }}
            className="h-control-md w-full rounded-control border border-border-default bg-surface pr-3 pl-9 text-label text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          />
        </label>
        {open ? (
          <div
            className={cn(
              "absolute top-[calc(100%+0.5rem)] left-0 z-50 w-[min(30rem,90vw)] overflow-y-auto",
              "max-h-[70vh] rounded-control border border-border-default bg-background-elevated shadow-lg",
            )}
          >
            <SearchResultsPanel term={term} onNavigate={go} />
          </div>
        ) : null}
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="top"
          className="flex h-dvh flex-col gap-0 p-0 [&>[data-slot=dialog-close]]:hidden"
        >
          <SheetTitle className="sr-only">Tìm kiếm toàn hệ thống</SheetTitle>
          <SheetDescription className="sr-only">
            Tìm dự án, công việc, thành viên, tài liệu, thông báo và phê duyệt.
          </SheetDescription>
          <div className="flex items-center gap-2 border-b border-border-default px-3 py-3">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-icon-md -translate-y-1/2 text-text-muted"
              />
              <input
                autoFocus
                type="search"
                value={value}
                placeholder={PLACEHOLDER}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                className="h-control-md w-full rounded-control border border-border-default bg-surface pr-3 pl-9 text-label text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              />
            </div>
            <IconButton
              variant="ghost"
              size="icon-sm"
              type="button"
              label="Đóng tìm kiếm"
              onClick={() => setMobileOpen(false)}
            >
              <X />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24">
            <SearchResultsPanel term={term} onNavigate={go} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
