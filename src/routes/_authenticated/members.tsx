import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cake, Eye, Lock, Pencil, Plus, Send, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, TableCellStack, TableRowActions } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EntityAvatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { cenToast } from "@/components/ui/toast";
import { MemberFormDrawer } from "@/components/org/member-form-drawer";
import { MemberDetailModal } from "@/components/org/member-detail-modal";
import { useOrgAccess } from "@/hooks/use-org-access";
import { setMemberStatus } from "@/lib/org.functions";
import { testPersonalTelegram } from "@/lib/telegram.functions";
import { avatarUrlMapQuery } from "@/lib/avatar-data";
import { CEN_TIMEZONE } from "@/lib/datetime";
import {
  ROLE_LABEL,
  STATUS_LABEL,
  membersQuery,
  teamsQuery,
  type AppRole,
  type MemberRow,
} from "@/lib/org-data";

export const Route = createFileRoute("/_authenticated/members")({
  head: () => ({
    meta: [
      { title: "Thành viên — CEN WORK" },
      {
        name: "description",
        content:
          "Danh sách thành viên CEN WORK: vai trò hệ thống, Team chính và trạng thái tài khoản.",
      },
      { property: "og:title", content: "Thành viên — CEN WORK" },
      {
        property: "og:description",
        content:
          "Danh sách thành viên CEN WORK: vai trò hệ thống, Team chính và trạng thái tài khoản.",
      },
    ],
  }),
  component: MembersPage,
});

const ALL = "__all__";

/** Tháng hiện tại theo múi giờ Hà Nội (1–12). */
function hanoiCurrentMonth(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CEN_TIMEZONE,
    month: "2-digit",
  }).format(new Date());
  return Number(parts);
}

/** Sinh nhật rơi vào tháng hiện tại. */
function isBirthdayThisMonth(birthday: string | null): boolean {
  if (!birthday) return false;
  const month = Number(birthday.slice(5, 7));
  return month === hanoiCurrentMonth();
}

function MembersPage() {
  const access = useOrgAccess();
  const queryClient = useQueryClient();

  const membersResult = useQuery(membersQuery());
  const teamsResult = useQuery(teamsQuery());

  const [search, setSearch] = React.useState("");
  const [teamFilter, setTeamFilter] = React.useState(ALL);
  const [roleFilter, setRoleFilter] = React.useState(ALL);
  const [statusFilter, setStatusFilter] = React.useState(ALL);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MemberRow | null>(null);
  const [lockTarget, setLockTarget] = React.useState<MemberRow | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<MemberRow | null>(null);

  const avatarPaths = React.useMemo(
    () =>
      (membersResult.data ?? [])
        .map((member) => member.avatar_path)
        .filter((path): path is string => Boolean(path)),
    [membersResult.data],
  );
  const avatarMap = useQuery(avatarUrlMapQuery(avatarPaths));

  const telegramTest = useMutation({
    mutationFn: (userId: string) => testPersonalTelegram({ data: { userId } }),
    onMutate: (userId: string) => setTestingId(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      cenToast.success("Đã gửi tin nhắn test tới Telegram cá nhân.");
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      cenToast.error(error.message);
    },
    onSettled: () => setTestingId(null),
  });

  const teams = teamsResult.data ?? [];
  const teamName = React.useCallback(
    (id: string | null) => teams.find((team) => team.id === id)?.name ?? "—",
    [teams],
  );

  const rows = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (membersResult.data ?? []).filter((member) => {
      if (keyword) {
        const haystack =
          `${member.display_name} ${member.email} ${member.job_title ?? ""}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      if (teamFilter !== ALL && member.primary_team_id !== teamFilter) return false;
      if (roleFilter !== ALL && member.role !== roleFilter) return false;
      if (statusFilter !== ALL && member.status !== statusFilter) return false;
      return true;
    });
  }, [membersResult.data, search, teamFilter, roleFilter, statusFilter]);

  const statusMutation = useMutation({
    mutationFn: (input: { userId: string; status: "active" | "locked" }) =>
      setMemberStatus({ data: input }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      cenToast.success(
        variables.status === "locked" ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản.",
      );
      setLockTarget(null);
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const columns = [
    {
      id: "member",
      header: "Thành viên",
      className: "min-w-[220px]",
      cell: (row: MemberRow) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <EntityAvatar
            name={row.display_name}
            size="sm"
            {...(row.avatar_path && avatarMap.data?.[row.avatar_path]
              ? { src: avatarMap.data[row.avatar_path] as string }
              : {})}
          />
          <TableCellStack primary={row.display_name} secondary={row.email} />
        </div>
      ),
    },
    {
      id: "job",
      header: "Chức danh",
      className: "min-w-[140px]",
      cell: (row: MemberRow) => (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-text-secondary">{row.job_title || "—"}</span>
          {isBirthdayThisMonth(row.birthday) ? (
            <Badge variant="brand" className="gap-1">
              <Cake className="size-3" aria-hidden /> Sinh nhật tháng này
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: "telegram",
      header: "Telegram",
      className: "min-w-[70px] w-[70px]",
      align: "center" as const,
      cell: (row: MemberRow) => {
        const canTest = access.canEditMember(row);
        const status = row.telegram_test_status;
        const isSuccess = status === "success";
        const isFailed = status === "failed";

        const colorClass = isSuccess
          ? "text-state-success hover:bg-state-success-surface hover:text-state-success"
          : isFailed
            ? "text-state-danger hover:bg-state-danger-surface hover:text-state-danger"
            : "text-text-muted hover:bg-surface-subtle hover:text-text-secondary";

        const tooltipLabel = isSuccess
          ? "Đã test thành công"
          : isFailed
            ? "Test lỗi"
            : row.telegram_user_id
              ? "Chưa test"
              : "Chưa có Telegram ID";

        const button = (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className={cn(colorClass)}
            loading={telegramTest.isPending && testingId === row.id}
            disabled={telegramTest.isPending || !canTest}
            onClick={() => telegramTest.mutate(row.id)}
            aria-label={tooltipLabel}
          >
            <Send />
          </Button>
        );

        return (
          <div className="flex justify-center">
            {canTest ? (
              <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent>{tooltipLabel}</TooltipContent>
              </Tooltip>
            ) : (
              button
            )}
          </div>
        );
      },
    },
    {
      id: "team",
      header: "Team",
      className: "min-w-[180px]",
      cell: (row: MemberRow) => (
        <TableCellStack
          primary={teamName(row.primary_team_id)}
          secondary={
            row.collaboratorTeamIds.length > 0
              ? `Phối hợp: ${row.collaboratorTeamIds.map(teamName).join(", ")}`
              : "Không có Team phối hợp"
          }
        />
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[120px]",
      cell: (row: MemberRow) => (
        <StatusBadge
          label={STATUS_LABEL[row.status]}
          tone={row.status === "active" ? "success" : "error"}
        />
      ),
    },
    {
      id: "actions",
      header: "Thao tác",
      align: "right" as const,
      className: "min-w-[140px] w-[140px]",
      cell: (row: MemberRow) => (
        <TableRowActions>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label={`Xem chi tiết ${row.display_name}`}
                onClick={() => setDetailTarget(row)}
              >
                <Eye />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Xem chi tiết</TooltipContent>
          </Tooltip>
          {/* Chỉ Admin và CMO được sửa thông tin thành viên. */}
          {access.isSystemAdmin ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  aria-label={`Sửa thành viên ${row.display_name}`}
                  onClick={() => {
                    setEditing(row);
                    setDrawerOpen(true);
                  }}
                >
                  <Pencil />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sửa thành viên</TooltipContent>
            </Tooltip>
          ) : null}
          {access.canLockMember && row.id !== access.userId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  aria-label={row.status === "active" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                  onClick={() => setLockTarget(row)}
                >
                  {row.status === "active" ? <Lock /> : <Unlock />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {row.status === "active" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </TableRowActions>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Thành viên"
        description="Quản lý hồ sơ nhân sự, vai trò hệ thống và phạm vi Team."
        actions={
          access.canCreateMember ? (
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setDrawerOpen(true);
              }}
            >
              <Plus /> Thêm thành viên
            </Button>
          ) : null
        }
      />

      <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          type="search"
          placeholder="Tìm theo tên, email, chức danh"
          value={search}
          aria-label="Tìm kiếm thành viên"
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger aria-label="Lọc theo Team">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả Team</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger aria-label="Lọc theo vai trò">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả vai trò</SelectItem>
            {(["admin", "cmo", "leader", "member"] as AppRole[]).map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            <SelectItem value="active">{STATUS_LABEL.active}</SelectItem>
            <SelectItem value="locked">{STATUS_LABEL.locked}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        rowClassName={(row) =>
          isBirthdayThisMonth(row.birthday)
            ? "bg-brand-primary/10 hover:bg-brand-primary/15"
            : undefined
        }
        density="compact"
        loading={membersResult.isLoading}
        error={membersResult.isError}
        onRetry={() => void membersResult.refetch()}
        errorTitle="Không tải được danh sách thành viên"
        emptyTitle="Chưa có thành viên phù hợp"
        emptyDescription="Điều chỉnh từ khóa hoặc bộ lọc để xem kết quả khác."
        caption="Danh sách thành viên"
      />

      <MemberDetailModal
        open={detailTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
        member={detailTarget}
        teams={teams}
        avatarUrl={
          detailTarget?.avatar_path
            ? (avatarMap.data?.[detailTarget.avatar_path] as string | undefined)
            : undefined
        }
      />

      <MemberFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        member={editing}
        teams={teams}
      />

      <ConfirmDialog
        open={lockTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLockTarget(null);
        }}
        tone={lockTarget?.status === "active" ? "destructive" : "normal"}
        title={lockTarget?.status === "active" ? "Khóa tài khoản?" : "Mở khóa tài khoản?"}
        description={
          lockTarget?.status === "active"
            ? `${lockTarget?.display_name} sẽ không thể đăng nhập cho tới khi được mở khóa.`
            : `${lockTarget?.display_name} sẽ đăng nhập lại được sau khi mở khóa.`
        }
        confirmLabel={lockTarget?.status === "active" ? "Khóa tài khoản" : "Mở khóa"}
        loading={statusMutation.isPending}
        onConfirm={() => {
          if (!lockTarget) return;
          statusMutation.mutate({
            userId: lockTarget.id,
            status: lockTarget.status === "active" ? "locked" : "active",
          });
        }}
      />
    </div>
  );
}
