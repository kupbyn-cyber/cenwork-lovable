import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cake, Eye, KeyRound, Lock, Pencil, Plus, RotateCcw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, TableCellStack, TableRowActions } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { TempPasswordModal } from "@/components/org/temp-password-modal";
import { MemberLockDialog } from "@/components/org/member-lock-dialog";
import { WorkdayStatsPanel } from "@/components/workday/workday-stats-panel";
import { useOrgAccess } from "@/hooks/use-org-access";
import { unlockMemberAccount } from "@/lib/org.functions";
import {
  archivedMembersQuery,
  resetLockedIdentity,
  type ArchivedMemberRow,
} from "@/lib/member-identity";
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
  // SEARCH-01: cho phép mở thẳng hồ sơ thành viên từ kết quả tìm kiếm.
  validateSearch: (search: Record<string, unknown>) => ({
    member: typeof search["member"] === "string" ? (search["member"] as string) : undefined,
  }),
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
  const archivedResult = useQuery(archivedMembersQuery(access.isAdmin));
  const [tab, setTab] = React.useState<"active" | "archived">("active");
  // WORKDAY-02: tab phụ trong màn Thành viên, không thêm menu/sidebar mới.
  const [mainTab, setMainTab] = React.useState<"list" | "workday">("list");
  const [restoreTarget, setRestoreTarget] = React.useState<ArchivedMemberRow | null>(null);

  const [search, setSearch] = React.useState("");
  const [teamFilter, setTeamFilter] = React.useState(ALL);
  const [roleFilter, setRoleFilter] = React.useState(ALL);
  const [statusFilter, setStatusFilter] = React.useState(ALL);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MemberRow | null>(null);
  const [lockTarget, setLockTarget] = React.useState<MemberRow | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<MemberRow | null>(null);
  const [tempPasswordTarget, setTempPasswordTarget] = React.useState<MemberRow | null>(null);

  // SEARCH-01: mở hồ sơ khi điều hướng kèm ?member=<id> (quyền xem vẫn do modal/RPC quyết định).
  const { member: memberParam } = Route.useSearch();
  React.useEffect(() => {
    if (!memberParam) return;
    const found = (membersResult.data ?? []).find((row) => row.id === memberParam);
    if (found) setDetailTarget(found);
  }, [memberParam, membersResult.data]);

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
      // Tài khoản đã khóa nằm ở tab "Tài khoản lưu trữ".
      if (member.status !== "active") return false;
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

  const unlockMutation = useMutation({
    mutationFn: (userId: string) => unlockMemberAccount({ data: { userId } }),
    onSuccess: () => {
      resetLockedIdentity();
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: ["active-people"] });
      void queryClient.invalidateQueries({ queryKey: ["reviewer-directory"] });
      cenToast.success("Đã khôi phục tài khoản.");
      setRestoreTarget(null);
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const archivedColumns = [
    {
      id: "member",
      header: "Thành viên",
      className: "min-w-[220px]",
      cell: (row: ArchivedMemberRow) => (
        <TableCellStack primary={row.display_name} secondary={row.email} />
      ),
    },
    {
      id: "role",
      header: "Vai trò cũ / Team cũ",
      className: "min-w-[180px]",
      cell: (row: ArchivedMemberRow) => (
        <TableCellStack
          primary={row.role ? (ROLE_LABEL[row.role as AppRole] ?? row.role) : "—"}
          secondary={row.team_name ?? "Không có Team"}
        />
      ),
    },
    {
      id: "locked",
      header: "Thời điểm khóa / Người khóa",
      className: "min-w-[200px]",
      cell: (row: ArchivedMemberRow) => (
        <TableCellStack
          primary={
            row.locked_at
              ? new Date(row.locked_at).toLocaleString("vi-VN", { timeZone: CEN_TIMEZONE })
              : "—"
          }
          secondary={row.locked_by_name ?? "—"}
        />
      ),
    },
    {
      id: "reason",
      header: "Lý do khóa",
      className: "min-w-[220px]",
      cell: (row: ArchivedMemberRow) => (
        <span className="text-text-secondary">{row.lock_reason ?? "—"}</span>
      ),
    },
    {
      id: "actions",
      header: "Thao tác",
      align: "right" as const,
      className: "min-w-[120px] w-[120px]",
      cell: (row: ArchivedMemberRow) => (
        <TableRowActions>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label={`Khôi phục tài khoản ${row.display_name}`}
                onClick={() => setRestoreTarget(row)}
              >
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Khôi phục tài khoản</TooltipContent>
          </Tooltip>
        </TableRowActions>
      ),
    },
  ].filter(
    // ORG-VIEW-01: cột Telegram chỉ dành cho Admin/CMO; người dùng thường chỉ xem danh bạ.
    (column) => access.isSystemAdmin || column.id !== "telegram",
  );

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
        <TableCellStack primary={teamName(row.primary_team_id)} secondary={row.email || "—"} />
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
          {/* MEMBER-AUTH: chỉ Admin/CMO, chỉ cho Leader/Member đang hoạt động, không cho chính mình. */}
          {access.canIssueTempPassword &&
          row.id !== access.userId &&
          row.status === "active" &&
          (row.role === "leader" || row.role === "member") ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  aria-label={`Cấp mật khẩu tạm cho ${row.display_name}`}
                  onClick={() => setTempPasswordTarget(row)}
                >
                  <KeyRound />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cấp mật khẩu tạm</TooltipContent>
            </Tooltip>
          ) : null}
          {/* Chỉ Admin được khóa; không tự khóa chính mình. */}
          {access.isAdmin && access.canLockMember && row.id !== access.userId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  aria-label={`Khóa tài khoản ${row.display_name}`}
                  onClick={() => setLockTarget(row)}
                >
                  <Lock />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Khóa tài khoản</TooltipContent>
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

      {/* WORKDAY-02: tab Ngày làm việc chỉ hiện với vai trò quản lý nhân sự (Leader/CMO/Admin). */}
      {access.isSystemAdmin || access.isLeader ? (
        <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as "list" | "workday")}>
          <TabsList>
            <TabsTrigger value="list">Danh sách</TabsTrigger>
            <TabsTrigger value="workday">Ngày làm việc</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {mainTab === "workday" && (access.isSystemAdmin || access.isLeader) ? (
        <WorkdayStatsPanel
          teams={teams}
          canFilterTeam={access.isSystemAdmin}
          canAdjust={access.isSystemAdmin || access.isLeader}
          defaultTeamId={access.leaderTeamId}
        />
      ) : (
        <>
          {access.isAdmin ? (
            <Tabs value={tab} onValueChange={(value) => setTab(value as "active" | "archived")}>
              <TabsList>
                <TabsTrigger value="active">Đang hoạt động</TabsTrigger>
                <TabsTrigger value="archived">
                  Tài khoản lưu trữ{" "}
                  {archivedResult.data?.length ? `(${archivedResult.data.length})` : ""}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {tab === "archived" && access.isAdmin ? (
            <DataTable
              columns={archivedColumns}
              data={archivedResult.data ?? []}
              getRowId={(row) => row.id}
              density="compact"
              loading={archivedResult.isLoading}
              error={archivedResult.isError}
              onRetry={() => void archivedResult.refetch()}
              errorTitle="Không tải được tài khoản lưu trữ"
              emptyTitle="Chưa có tài khoản nào bị khóa"
              emptyDescription="Tài khoản sau khi khóa sẽ xuất hiện tại đây."
              caption="Tài khoản lưu trữ"
            />
          ) : (
            <>
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
                {access.isSystemAdmin ? (
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
                ) : null}
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
            </>
          )}
        </>
      )}

      <TempPasswordModal
        open={tempPasswordTarget !== null}
        onOpenChange={(open) => {
          if (!open) setTempPasswordTarget(null);
        }}
        member={tempPasswordTarget}
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

      <MemberLockDialog
        member={lockTarget}
        onOpenChange={(open) => {
          if (!open) setLockTarget(null);
        }}
      />

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        title="Khôi phục tài khoản?"
        description={`${restoreTarget?.display_name ?? ""} sẽ đăng nhập lại được và xuất hiện trong danh sách hoạt động. Các trách nhiệm cũ đã chuyển giao không được trả lại tự động.`}
        confirmLabel="Khôi phục"
        loading={unlockMutation.isPending}
        onConfirm={() => {
          if (!restoreTarget) return;
          unlockMutation.mutate(restoreTarget.id);
        }}
      />
    </div>
  );
}
