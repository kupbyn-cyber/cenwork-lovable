import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DutyAssignmentList } from "@/components/duty/duty-assignment-list";
import { DutyFormDrawer } from "@/components/duty/duty-form-drawer";
import { DutyRulesPanel } from "@/components/duty/duty-rules-panel";

import { useAuth } from "@/hooks/use-auth";
import { useOrgAccess } from "@/hooks/use-org-access";
import { activeMembersQuery } from "@/lib/org-data";
import {
  DUTY_DUE_TIME,
  DUTY_END_TIME,
  DUTY_START_TIME,
  deleteDutyAssignment,
  dutyAssignmentsQuery,
  dutyCatalogQuery,
  effectiveDutyStatus,
  myDutyAssignmentsQuery,
  saveDutyAssignment,
  setDutyCompleted,
  type DutyAssignmentInput,
  type DutyAssignmentRow,
  type DutyStatus,
} from "@/lib/duty-data";

/**
 * CEN DUTY-02 — Trang Lịch trực nhật.
 * Quyền tạo/sửa/xóa do RLS `can_manage_duty()` quyết định; UI chỉ ẩn thao tác.
 */
export const Route = createFileRoute("/_authenticated/duty")({
  head: () => ({
    meta: [
      { title: "Lịch trực nhật — CEN WORK" },
      {
        name: "description",
        content:
          "Xem lịch trực nhật theo tuần hoặc tháng, nhập lịch thủ công, đánh dấu hoàn thành và tra cứu nội quy vệ sinh của CEN WORK.",
      },
      { property: "og:title", content: "Lịch trực nhật — CEN WORK" },
      {
        property: "og:description",
        content:
          "Xem lịch trực nhật theo tuần hoặc tháng, nhập lịch thủ công, đánh dấu hoàn thành và tra cứu nội quy vệ sinh của CEN WORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DutyPage,
});

const ALL = "__all__";

function toISO(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

function todayISO(): string {
  return toISO(new Date());
}

/** Khoảng ngày của tuần (bắt đầu thứ hai) hoặc tháng, tính từ mốc `anchor` và bước `offset`. */
function buildRange(mode: "week" | "month", offset: number) {
  const now = new Date(`${todayISO()}T00:00:00Z`);
  if (mode === "week") {
    const day = (now.getUTCDay() + 6) % 7;
    const start = new Date(now);
    start.setUTCDate(now.getUTCDate() - day + offset * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function rangeLabel(mode: "week" | "month", range: { from: string; to: string }) {
  const [, m, d] = range.from.split("-");
  const [ey, em, ed] = range.to.split("-");
  if (mode === "month") return `Tháng ${em}/${ey}`;
  return `${d}/${m} – ${ed}/${em}/${ey}`;
}

function DutyPage() {
  const { user } = useAuth();
  const access = useOrgAccess();
  const queryClient = useQueryClient();

  const [mode, setMode] = React.useState<"week" | "month">("week");
  const [offset, setOffset] = React.useState(0);
  const [areaFilter, setAreaFilter] = React.useState<string>(ALL);
  const [teamFilter, setTeamFilter] = React.useState<string>(ALL);
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  // DUTY-LIST-UX-01: mặc định ưu tiên hôm nay và các lịch gần nhất.
  const [view, setView] = React.useState<"upcoming" | "completed" | "all">("upcoming");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DutyAssignmentRow | null>(null);
  const [deleting, setDeleting] = React.useState<DutyAssignmentRow | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const range = React.useMemo(() => buildRange(mode, offset), [mode, offset]);
  const catalog = useQuery(dutyCatalogQuery());
  const assignments = useQuery(dutyAssignmentsQuery(range));
  const mine = useQuery(myDutyAssignmentsQuery(user?.id));
  const members = useQuery(activeMembersQuery());

  const people = React.useMemo(
    () =>
      (members.data ?? [])
        .filter((m) => m.status === "active")
        .map((m) => ({ id: m.id, display_name: m.display_name })),
    [members.data],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["duty-assignments"] });
    void queryClient.invalidateQueries({ queryKey: ["duty-assignments-mine"] });
  };

  const saveMutation = useMutation({
    mutationFn: (input: DutyAssignmentInput) => saveDutyAssignment(input, user?.id ?? null),
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
      setFormError(null);
      invalidate();
      toast.success("Đã lưu lịch trực nhật.");
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      setDutyCompleted(id, completed),
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: (_data, variables) => {
      invalidate();
      toast.success(variables.completed ? "Đã đánh dấu hoàn thành." : "Đã mở lại phân công.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDutyAssignment(id),
    onSuccess: () => {
      setDeleting(null);
      invalidate();
      toast.success("Đã xóa lịch trực nhật.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const actions = {
    canManage: access.can("organization.manage") || access.isSystemAdmin || access.isLeader,
    userId: user?.id ?? null,
    busyId,
    onEdit: (row: DutyAssignmentRow) => {
      setEditing(row);
      setFormError(null);
      setFormOpen(true);
    },
    onDelete: (row: DutyAssignmentRow) => setDeleting(row),
    onToggleComplete: (row: DutyAssignmentRow, completed: boolean) =>
      toggleMutation.mutate({ id: row.id, completed }),
  };

  const filtered = React.useMemo(() => {
    const rows = assignments.data ?? [];
    const today = toISO(new Date());
    return rows.filter((row) => {
      if (areaFilter !== ALL && row.area_id !== areaFilter) return false;
      if (teamFilter !== ALL && row.duty_team_id !== teamFilter) return false;
      if (statusFilter !== ALL && effectiveDutyStatus(row) !== (statusFilter as DutyStatus)) {
        return false;
      }
      if (view === "upcoming" && (row.duty_date < today || row.status === "completed")) return false;
      if (view === "completed" && row.status !== "completed") return false;
      return true;
    });
  }, [assignments.data, areaFilter, teamFilter, statusFilter, view]);

  const today = todayISO();
  const myRows = mine.data ?? [];
  const myToday = myRows.filter((row) => row.duty_date === today);
  const myUpcoming = myRows.filter((row) => row.duty_date > today && row.status !== "completed");
  const myOverdue = myRows.filter(
    (row) => row.duty_date < today && effectiveDutyStatus(row) === "overdue",
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Lịch trực nhật"
        description={`Giờ trực ${DUTY_START_TIME}–${DUTY_END_TIME}, hạn hoàn thành ${DUTY_DUE_TIME} cùng ngày.`}
        actions={
          actions.canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormError(null);
                setFormOpen(true);
              }}
            >
              <CalendarPlus />
              Tạo lịch trực
            </Button>
          ) : undefined
        }
      />

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex min-w-0 flex-col gap-3 rounded-control border border-border-default bg-background-elevated p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
            <h2 className="min-w-0 truncate text-h4 text-text-primary">Lịch trực chung</h2>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Kỳ trước" onClick={() => setOffset((v) => v - 1)}>
                <ChevronLeft />
              </Button>
              <span className="min-w-[9rem] text-center text-label text-text-secondary">
                {rangeLabel(mode, range)}
              </span>
              <Button variant="ghost" size="icon-sm" aria-label="Kỳ sau" onClick={() => setOffset((v) => v + 1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
              <TabsList>
                <TabsTrigger value="upcoming">Hôm nay &amp; sắp tới</TabsTrigger>
                <TabsTrigger value="completed">Đã hoàn thành</TabsTrigger>
                <TabsTrigger value="all">Tất cả</TabsTrigger>
              </TabsList>
            </Tabs>

            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as "week" | "month");
                setOffset(0);
              }}
            >
              <TabsList>
                <TabsTrigger value="week">Tuần</TabsTrigger>
                <TabsTrigger value="month">Tháng</TabsTrigger>
              </TabsList>
              <TabsContent value="week" />
              <TabsContent value="month" />
            </Tabs>

            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Lọc theo team">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả team</SelectItem>
                {(catalog.data?.teams ?? []).map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Lọc theo khu vực">
                <SelectValue placeholder="Khu vực" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả khu vực</SelectItem>
                {(catalog.data?.areas ?? []).map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Lọc theo trạng thái">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
                <SelectItem value="pending">Chưa hoàn thành</SelectItem>
                <SelectItem value="completed">Đã hoàn thành</SelectItem>
                <SelectItem value="overdue">Quá hạn</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {assignments.isLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : assignments.error ? (
            <p className="text-caption text-state-danger">{(assignments.error as Error).message}</p>
          ) : (
            <DutyAssignmentList
              rows={filtered}
              actions={actions}
              emptyTitle="Chưa có lịch trực trong kỳ này"
              emptyDescription={
                actions.canManage
                  ? "Tạo lịch trực thủ công cho từng ngày bằng nút Tạo lịch trực."
                  : "Quản trị hoặc trưởng nhóm sẽ nhập lịch cho kỳ này."
              }
            />
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="min-w-0 rounded-control border border-border-default bg-background-elevated p-4">
            <h2 className="mb-3 text-h4 text-text-primary">Việc trực của tôi</h2>
            {mine.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="flex flex-col gap-4">
                {myOverdue.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-caption font-semibold text-state-danger uppercase">Quá hạn</h3>
                    <DutyAssignmentList rows={myOverdue} actions={actions} />
                  </div>
                ) : null}
                <div>
                  <h3 className="mb-2 text-caption font-semibold text-text-muted uppercase">Hôm nay</h3>
                  <DutyAssignmentList
                    rows={myToday}
                    actions={actions}
                    emptyTitle="Hôm nay bạn không có lịch trực"
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-caption font-semibold text-text-muted uppercase">Sắp tới</h3>
                  <DutyAssignmentList
                    rows={myUpcoming}
                    actions={actions}
                    emptyTitle="Chưa có lịch trực sắp tới"
                  />
                </div>
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-control border border-border-default bg-background-elevated p-4">
            <h2 className="mb-3 text-h4 text-text-primary">Nội quy &amp; tiêu chuẩn vệ sinh</h2>
            <DutyRulesPanel />
          </section>
        </div>
      </div>

      <DutyFormDrawer
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(null);
          }}
          assignment={editing}
          catalog={catalog.data ?? { areas: [], jobTypes: [], teams: [], providers: [] }}
          catalogLoading={catalog.isLoading}
          catalogError={catalog.error ? (catalog.error as Error).message : null}
          people={people}
          submitting={saveMutation.isPending}
          serverError={formError}
          onSubmit={(input) => saveMutation.mutate(input)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Xóa lịch trực nhật?"
        description="Phân công này sẽ bị xóa khỏi lịch. Thao tác không thể hoàn tác."
        confirmLabel="Xóa lịch"
        tone="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
      />
    </div>
  );
}
