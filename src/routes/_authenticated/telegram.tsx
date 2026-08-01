import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send, Trash2 } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDateTime } from "@/lib/datetime";
import { membersQuery, teamsQuery } from "@/lib/org-data";
import { PERMISSIONS } from "@/lib/permissions";
import {
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUS_TONE,
  deleteTeamLink,
  deleteUserLink,
  maskChatId,
  telegramOutboxQuery,
  telegramTeamLinksQuery,
  telegramUserLinksQuery,
  upsertTeamLink,
  upsertUserLink,
  type DeliveryStatus,
  type TelegramOutboxRow,
  type TelegramTeamLinkRow,
  type TelegramUserLinkRow,
} from "@/lib/telegram-data";
import { dispatchTelegramQueue } from "@/lib/telegram.functions";

const TITLE = "Kết nối Telegram — CEN 1.0";
const DESCRIPTION =
  "Quản trị kết nối Telegram của CEN 1.0: ánh xạ cá nhân, ánh xạ Team/topic và hàng đợi gửi tin.";

export const Route = createFileRoute("/_authenticated/telegram")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TelegramPage,
});

function TelegramPage() {
  const access = useOrgAccess();
  const canManage = access.can(PERMISSIONS.TELEGRAM_MANAGE);
  const queryClient = useQueryClient();

  const members = useQuery({ ...membersQuery(), enabled: canManage });
  const teams = useQuery({ ...teamsQuery(), enabled: canManage });
  const userLinks = useQuery(telegramUserLinksQuery(canManage));
  const teamLinks = useQuery(telegramTeamLinksQuery(canManage));
  const outbox = useQuery(telegramOutboxQuery(canManage));

  const [userForm, setUserForm] = React.useState({ userId: "", chatId: "", active: true });
  const [teamForm, setTeamForm] = React.useState({
    teamId: "",
    chatId: "",
    topicId: "",
    active: true,
  });

  function refreshLinks() {
    void queryClient.invalidateQueries({ queryKey: ["telegram-user-links"] });
    void queryClient.invalidateQueries({ queryKey: ["telegram-team-links"] });
  }

  const saveUser = useMutation({
    mutationFn: () =>
      upsertUserLink({
        userId: userForm.userId,
        chatId: userForm.chatId,
        isActive: userForm.active,
      }),
    onSuccess: () => {
      cenToast.success("Đã lưu ánh xạ Telegram cá nhân.");
      setUserForm({ userId: "", chatId: "", active: true });
      refreshLinks();
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const saveTeam = useMutation({
    mutationFn: () =>
      upsertTeamLink({
        teamId: teamForm.teamId,
        chatId: teamForm.chatId,
        topicId: teamForm.topicId.trim() || null,
        isActive: teamForm.active,
      }),
    onSuccess: () => {
      cenToast.success("Đã lưu ánh xạ Telegram của Team.");
      setTeamForm({ teamId: "", chatId: "", topicId: "", active: true });
      refreshLinks();
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const removeUser = useMutation({
    mutationFn: (id: string) => deleteUserLink(id),
    onSuccess: refreshLinks,
    onError: (error: Error) => cenToast.error(error.message),
  });
  const removeTeam = useMutation({
    mutationFn: (id: string) => deleteTeamLink(id),
    onSuccess: refreshLinks,
    onError: (error: Error) => cenToast.error(error.message),
  });

  const dispatch = useMutation({
    mutationFn: () => dispatchTelegramQueue(),
    onSuccess: (result) => {
      cenToast.success(
        `Đã xử lý ${result.processed} tin: ${result.sent} thành công, ${result.failed} lỗi.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["telegram-outbox"] });
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const memberName = (id: string) =>
    members.data?.find((member) => member.id === id)?.display_name ?? id;
  const teamName = (id: string) => teams.data?.find((team) => team.id === id)?.name ?? id;

  if (!access.loading && !canManage) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="Kết nối Telegram" />
        <Card>
          <CardContent>
            <EmptyState
              title="Không có quyền truy cập"
              description="Chỉ Admin được quản lý kết nối Telegram."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const userColumns = [
    {
      id: "user",
      header: "Thành viên",
      className: "min-w-[180px]",
      cell: (row: TelegramUserLinkRow) => memberName(row.user_id),
    },
    {
      id: "chat",
      header: "Chat ID",
      className: "min-w-[120px]",
      cell: (row: TelegramUserLinkRow) => (
        <span className="text-text-secondary">{maskChatId(row.chat_id)}</span>
      ),
    },
    {
      id: "state",
      header: "Trạng thái",
      className: "min-w-[120px]",
      cell: (row: TelegramUserLinkRow) => (
        <StatusBadge
          tone={row.is_active ? "success" : "neutral"}
          label={row.is_active ? "Đang bật" : "Đang tắt"}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      className: "w-[64px]",
      cell: (row: TelegramUserLinkRow) => (
        <IconButton
          variant="ghost"
          size="icon-sm"
          type="button"
          label="Gỡ ánh xạ"
          onClick={() => removeUser.mutate(row.id)}
        >
          <Trash2 />
        </IconButton>
      ),
    },
  ];

  const teamColumns = [
    {
      id: "team",
      header: "Team",
      className: "min-w-[180px]",
      cell: (row: TelegramTeamLinkRow) => teamName(row.team_id),
    },
    {
      id: "chat",
      header: "Chat ID",
      className: "min-w-[120px]",
      cell: (row: TelegramTeamLinkRow) => (
        <span className="text-text-secondary">{maskChatId(row.chat_id)}</span>
      ),
    },
    {
      id: "topic",
      header: "Topic",
      className: "min-w-[100px]",
      cell: (row: TelegramTeamLinkRow) => row.topic_id ?? "—",
    },
    {
      id: "state",
      header: "Trạng thái",
      className: "min-w-[120px]",
      cell: (row: TelegramTeamLinkRow) => (
        <StatusBadge
          tone={row.is_active ? "success" : "neutral"}
          label={row.is_active ? "Đang bật" : "Đang tắt"}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      className: "w-[64px]",
      cell: (row: TelegramTeamLinkRow) => (
        <IconButton
          variant="ghost"
          size="icon-sm"
          type="button"
          label="Gỡ ánh xạ"
          onClick={() => removeTeam.mutate(row.id)}
        >
          <Trash2 />
        </IconButton>
      ),
    },
  ];

  const outboxColumns = [
    {
      id: "created",
      header: "Thời gian",
      className: "min-w-[150px] whitespace-nowrap",
      cell: (row: TelegramOutboxRow) => formatHanoiDateTime(row.created_at),
    },
    {
      id: "target",
      header: "Đích gửi",
      className: "min-w-[150px]",
      cell: (row: TelegramOutboxRow) => (
        <span className="text-text-secondary">
          {row.target_type === "team" ? "Team" : "Cá nhân"} · {maskChatId(row.chat_id)}
        </span>
      ),
    },
    {
      id: "message",
      header: "Nội dung",
      className: "min-w-[260px]",
      cell: (row: TelegramOutboxRow) => (
        <span className="line-clamp-2 min-w-0 break-words text-body-sm">{row.message}</span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[160px]",
      cell: (row: TelegramOutboxRow) => (
        <div className="flex min-w-0 flex-col gap-1">
          <StatusBadge
            tone={DELIVERY_STATUS_TONE[row.status as DeliveryStatus]}
            label={DELIVERY_STATUS_LABEL[row.status as DeliveryStatus]}
          />
          <span className="text-caption text-text-muted">Số lần thử: {row.attempts}</span>
          {row.last_error ? (
            <span className="min-w-0 break-words text-caption text-state-danger">
              {row.last_error}
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Kết nối Telegram"
        description="Ánh xạ tài khoản CEN với Telegram và theo dõi hàng đợi gửi tin."
        actions={
          <Button type="button" loading={dispatch.isPending} onClick={() => dispatch.mutate()}>
            <Send />
            Gửi hàng đợi
          </Button>
        }
      />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Cá nhân</TabsTrigger>
          <TabsTrigger value="teams">Team / topic</TabsTrigger>
          <TabsTrigger value="outbox">Hàng đợi gửi</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <SectionHeader title="Thêm hoặc cập nhật ánh xạ cá nhân" />
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <FormField id="tg-user" label="Thành viên" required>
                  {(control) => (
                    <Select
                      value={userForm.userId}
                      onValueChange={(value) => setUserForm({ ...userForm, userId: value })}
                    >
                      <SelectTrigger {...control} aria-label="Thành viên">
                        <SelectValue placeholder="Chọn thành viên" />
                      </SelectTrigger>
                      <SelectContent>
                        {(members.data ?? []).map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField
                  id="tg-user-chat"
                  label="Chat ID Telegram"
                  required
                  helperText="Chat ID cá nhân giữa người dùng và bot."
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={userForm.chatId}
                      onChange={(event) =>
                        setUserForm({ ...userForm, chatId: event.target.value })
                      }
                      placeholder="Ví dụ: 123456789"
                    />
                  )}
                </FormField>
              </div>
              <label className="flex items-center gap-2 text-body-sm">
                <Checkbox
                  checked={userForm.active}
                  onCheckedChange={(value) =>
                    setUserForm({ ...userForm, active: value === true })
                  }
                  aria-label="Bật gửi Telegram"
                />
                Bật gửi Telegram cho thành viên này
              </label>
              <div>
                <Button
                  type="button"
                  disabled={!userForm.userId || !userForm.chatId.trim()}
                  loading={saveUser.isPending}
                  onClick={() => saveUser.mutate()}
                >
                  Lưu ánh xạ
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <DataTable
                columns={userColumns}
                data={userLinks.data ?? []}
                getRowId={(row) => row.id}
                loading={userLinks.isLoading}
                error={userLinks.isError}
                emptyTitle="Chưa có ánh xạ cá nhân"
                emptyDescription="Thêm Chat ID để thành viên nhận thông báo Telegram."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <SectionHeader title="Thêm hoặc cập nhật ánh xạ Team" />
              <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                <FormField id="tg-team" label="Team" required>
                  {(control) => (
                    <Select
                      value={teamForm.teamId}
                      onValueChange={(value) => setTeamForm({ ...teamForm, teamId: value })}
                    >
                      <SelectTrigger {...control} aria-label="Team">
                        <SelectValue placeholder="Chọn Team" />
                      </SelectTrigger>
                      <SelectContent>
                        {(teams.data ?? []).map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField id="tg-team-chat" label="Chat ID nhóm" required>
                  {(control) => (
                    <Input
                      {...control}
                      value={teamForm.chatId}
                      onChange={(event) =>
                        setTeamForm({ ...teamForm, chatId: event.target.value })
                      }
                      placeholder="Ví dụ: -1001234567890"
                    />
                  )}
                </FormField>
                <FormField id="tg-team-topic" label="Topic ID" helperText="Bỏ trống nếu nhóm không dùng topic.">
                  {(control) => (
                    <Input
                      {...control}
                      value={teamForm.topicId}
                      onChange={(event) =>
                        setTeamForm({ ...teamForm, topicId: event.target.value })
                      }
                      placeholder="Ví dụ: 12"
                    />
                  )}
                </FormField>
              </div>
              <label className="flex items-center gap-2 text-body-sm">
                <Checkbox
                  checked={teamForm.active}
                  onCheckedChange={(value) =>
                    setTeamForm({ ...teamForm, active: value === true })
                  }
                  aria-label="Bật gửi Telegram cho Team"
                />
                Bật gửi Telegram cho Team này
              </label>
              <div>
                <Button
                  type="button"
                  disabled={!teamForm.teamId || !teamForm.chatId.trim()}
                  loading={saveTeam.isPending}
                  onClick={() => saveTeam.mutate()}
                >
                  Lưu ánh xạ
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <DataTable
                columns={teamColumns}
                data={teamLinks.data ?? []}
                getRowId={(row) => row.id}
                loading={teamLinks.isLoading}
                error={teamLinks.isError}
                emptyTitle="Chưa có ánh xạ Team"
                emptyDescription="Thêm Chat ID nhóm để gửi thông báo theo Team hoặc topic."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outbox" className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <SectionHeader
                title="Hàng đợi gửi Telegram"
                description="Tin lỗi sẽ được thử lại tối đa 5 lần khi bấm Gửi hàng đợi."
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => void outbox.refetch()}
                  >
                    <RefreshCw />
                    Làm mới
                  </Button>
                }
              />
              <DataTable
                columns={outboxColumns}
                data={outbox.data ?? []}
                getRowId={(row) => row.id}
                loading={outbox.isLoading}
                error={outbox.isError}
                emptyTitle="Hàng đợi trống"
                emptyDescription="Chưa có tin nhắn Telegram nào được tạo."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
