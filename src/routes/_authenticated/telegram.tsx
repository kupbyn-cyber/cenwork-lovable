import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordInput } from "@/components/ui/password-input";
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
import { PERMISSIONS } from "@/lib/permissions";
import {
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUS_TONE,
  maskChatId,
  saveMemberTelegram,
  saveTeamTelegram,
  telegramMembersQuery,
  telegramOutboxQuery,
  telegramTeamsQuery,
  type DeliveryStatus,
  type TelegramMemberRow,
  type TelegramOutboxRow,
  type TelegramTeamRow,
} from "@/lib/telegram-data";
import { dispatchTelegramQueue, getTelegramConfig, saveTelegramConfig } from "@/lib/telegram.functions";
import { enqueueAnnouncementReminders } from "@/lib/announcement.functions";

const TITLE = "Kết nối Telegram — CEN WORK";
const DESCRIPTION =
  "Quản trị Telegram của CEN WORK: cấu hình bot dùng chung, ánh xạ cá nhân, topic của Team và hàng đợi gửi tin.";

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

/** Khu vực cấu hình chung: một Bot, một Group Chat. Chỉ Admin. */
function ConfigSection() {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ["telegram-config"],
    queryFn: () => getTelegramConfig(),
  });

  const [groupChatId, setGroupChatId] = React.useState("");
  const [dailyTopicId, setDailyTopicId] = React.useState("");
  const [botToken, setBotToken] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (config.data) {
      setGroupChatId(config.data.groupChatId);
      setDailyTopicId(config.data.dailyReportTopicId ?? "");
    }
  }, [config.data]);

  const save = useMutation({
    mutationFn: () =>
      saveTelegramConfig({
        data: {
          groupChatId,
          dailyReportTopicId: dailyTopicId,
          ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
        },
      }),
    onSuccess: () => {
      setBotToken("");
      setError(null);
      cenToast.success("Đã lưu cấu hình Telegram.");
      void queryClient.invalidateQueries({ queryKey: ["telegram-config"] });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const test = useMutation({
    mutationFn: () => testTelegramConnection(),
    onSuccess: () => {
      setError(null);
      cenToast.success("Đã gửi tin kiểm tra vào Group và Topic Báo cáo ngày.");
    },
    onError: (testError: Error) => setError(testError.message),
  });

  return (
    <Card>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <SectionHeader
          title="Cấu hình Telegram"
          description="Một Bot dùng chung, một Group Chat chung và một Topic Báo cáo ngày chung cho toàn hệ thống."
        />
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <FormField
            id="tg-group-chat"
            label="Group Chat ID chung"
            required
            helperText="Áp dụng cho mọi Team, không nhập riêng theo Team."
          >
            {(control) => (
              <Input
                {...control}
                value={groupChatId}
                placeholder="-1002041537249"
                onChange={(event) => setGroupChatId(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            id="tg-daily-topic"
            label="Daily Report Topic Thread ID"
            required
            helperText="Topic chung nhận Báo cáo ngày của tất cả Team."
          >
            {(control) => (
              <Input
                {...control}
                value={dailyTopicId}
                placeholder="Ví dụ: 25"
                onChange={(event) => setDailyTopicId(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            id="tg-bot-token"
            label="Bot Token"
            helperText={
              config.data?.botConfigured
                ? `Đã cấu hình (${config.data.botTokenMasked}). Để trống nếu không đổi.`
                : "Chưa cấu hình. Token chỉ được lưu và dùng ở phía máy chủ."
            }
          >
            {(control) => (
              <PasswordInput
                {...control}
                value={botToken}
                autoComplete="off"
                placeholder="123456789:AA..."
                onChange={(event) => setBotToken(event.target.value)}
              />
            )}
          </FormField>
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-state-danger/50 bg-state-danger-surface px-3 py-2 text-helper text-state-danger"
          >
            {error}
          </p>
        ) : null}
        {test.isSuccess && !error ? (
          <p className="rounded-control border border-state-success/50 bg-state-success-surface px-3 py-2 text-helper text-state-success">
            Kết nối hợp lệ: Bot đã gửi được tin kiểm tra vào đúng Group và Topic Báo cáo ngày.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            loading={save.isPending}
            disabled={config.isLoading || !groupChatId.trim() || !dailyTopicId.trim()}
            onClick={() => save.mutate()}
          >
            Lưu cấu hình
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={test.isPending}
            disabled={config.isLoading || !config.data?.botConfigured}
            onClick={() => test.mutate()}
          >
            <PlugZap />
            Kiểm tra kết nối
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TelegramPage() {
  const access = useOrgAccess();
  const canManage = access.can(PERMISSIONS.TELEGRAM_MANAGE);
  const queryClient = useQueryClient();

  const members = useQuery(telegramMembersQuery(canManage));
  const teams = useQuery(telegramTeamsQuery(canManage));
  const outbox = useQuery(telegramOutboxQuery(canManage));

  const [userForm, setUserForm] = React.useState({ userId: "", chatId: "", active: true });
  const [teamForm, setTeamForm] = React.useState({ teamId: "", topicId: "", active: true });
  const [confirm, setConfirm] = React.useState<null | "reminders" | "dispatch">(null);

  const saveUser = useMutation({
    mutationFn: () =>
      saveMemberTelegram({
        userId: userForm.userId,
        telegramUserId: userForm.chatId,
        enabled: userForm.active,
      }),
    onSuccess: () => {
      cenToast.success("Đã lưu Telegram User ID của thành viên.");
      setUserForm({ userId: "", chatId: "", active: true });
      void queryClient.invalidateQueries({ queryKey: ["telegram-members"] });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const saveTeam = useMutation({
    mutationFn: () =>
      saveTeamTelegram({
        teamId: teamForm.teamId,
        topicId: teamForm.topicId.trim() || null,
        enabled: teamForm.active,
      }),
    onSuccess: () => {
      cenToast.success("Đã lưu Topic Thread ID của Team.");
      setTeamForm({ teamId: "", topicId: "", active: true });
      void queryClient.invalidateQueries({ queryKey: ["telegram-teams"] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
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

  const reminders = useMutation({
    mutationFn: () => enqueueAnnouncementReminders(),
    onSuccess: (result: unknown) => {
      const count = typeof result === "number" ? result : (result as { count?: number })?.count;
      cenToast.success(
        typeof count === "number"
          ? `Đã tạo ${count} thông báo nhắc hạn vào hàng đợi.`
          : "Đã tạo thông báo nhắc hạn vào hàng đợi.",
      );
      void queryClient.invalidateQueries({ queryKey: ["telegram-outbox"] });
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

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
      className: "min-w-[200px]",
      cell: (row: TelegramMemberRow) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{row.display_name}</span>
          <span className="truncate text-caption text-text-muted">{row.email}</span>
        </div>
      ),
    },
    {
      id: "chat",
      header: "Telegram User ID",
      className: "min-w-[150px]",
      cell: (row: TelegramMemberRow) => (
        <span className="text-text-secondary">
          {row.telegram_user_id ? maskChatId(row.telegram_user_id) : "—"}
        </span>
      ),
    },
    {
      id: "state",
      header: "Nhận thông báo",
      className: "min-w-[140px]",
      cell: (row: TelegramMemberRow) => (
        <StatusBadge
          tone={row.telegram_enabled && row.telegram_user_id ? "success" : "neutral"}
          label={
            !row.telegram_user_id
              ? "Chưa ánh xạ"
              : row.telegram_enabled
                ? "Đang bật"
                : "Đang tắt"
          }
        />
      ),
    },
  ];

  const teamColumns = [
    {
      id: "team",
      header: "Team",
      className: "min-w-[200px]",
      cell: (row: TelegramTeamRow) => row.name,
    },
    {
      id: "topic",
      header: "Topic Thread ID",
      className: "min-w-[150px]",
      cell: (row: TelegramTeamRow) => row.telegram_topic_id ?? "—",
    },
    {
      id: "state",
      header: "Gửi Telegram",
      className: "min-w-[140px]",
      cell: (row: TelegramTeamRow) => (
        <StatusBadge
          tone={row.telegram_enabled ? "success" : "neutral"}
          label={row.telegram_enabled ? "Đang bật" : "Đang tắt"}
        />
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
          {row.topic_id ? ` · topic ${row.topic_id}` : ""}
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
        description="Một Bot chung, một Group Chat chung; mỗi Team một Topic Thread ID, mỗi thành viên một Telegram User ID."
      />

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Cấu hình</TabsTrigger>
          <TabsTrigger value="users">Cá nhân</TabsTrigger>
          <TabsTrigger value="teams">Team / topic</TabsTrigger>
          <TabsTrigger value="outbox">Hàng đợi gửi</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="flex min-w-0 flex-col gap-4">
          <ConfigSection />
        </TabsContent>

        <TabsContent value="users" className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <SectionHeader
                title="Ánh xạ Telegram cá nhân"
                description="Dữ liệu này nằm trong hồ sơ thành viên, dùng chung với trang Thành viên."
              />
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <FormField id="tg-user" label="Thành viên" required>
                  {(control) => (
                    <Select
                      value={userForm.userId}
                      onValueChange={(value) => {
                        const member = members.data?.find((row) => row.id === value);
                        setUserForm({
                          userId: value,
                          chatId: member?.telegram_user_id ?? "",
                          active: member?.telegram_enabled ?? true,
                        });
                      }}
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
                  label="Telegram User ID"
                  helperText="ID cá nhân của thành viên trên Telegram."
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={userForm.chatId}
                      onChange={(event) => setUserForm({ ...userForm, chatId: event.target.value })}
                      placeholder="Ví dụ: 123456789"
                    />
                  )}
                </FormField>
              </div>
              <label className="flex items-center gap-2 text-body-sm">
                <Checkbox
                  checked={userForm.active}
                  onCheckedChange={(value) => setUserForm({ ...userForm, active: value === true })}
                  aria-label="Nhận thông báo Telegram cá nhân"
                />
                Nhận thông báo Telegram cá nhân
              </label>
              <div>
                <Button
                  type="button"
                  disabled={!userForm.userId}
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
                data={members.data ?? []}
                getRowId={(row) => row.id}
                loading={members.isLoading}
                error={members.isError}
                emptyTitle="Chưa có thành viên"
                emptyDescription="Thêm Telegram User ID để thành viên nhận thông báo."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <SectionHeader
                title="Topic Thread ID theo Team"
                description="Mọi Team dùng chung Group Chat ID cấu hình ở tab Cấu hình; chỉ Topic Thread ID là riêng."
              />
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <FormField id="tg-team" label="Team" required>
                  {(control) => (
                    <Select
                      value={teamForm.teamId}
                      onValueChange={(value) => {
                        const team = teams.data?.find((row) => row.id === value);
                        setTeamForm({
                          teamId: value,
                          topicId: team?.telegram_topic_id ?? "",
                          active: team?.telegram_enabled ?? false,
                        });
                      }}
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
                <FormField
                  id="tg-team-topic"
                  label="Telegram Topic Thread ID"
                  helperText="Bắt buộc nếu bật gửi Telegram cho Team."
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={teamForm.topicId}
                      onChange={(event) => setTeamForm({ ...teamForm, topicId: event.target.value })}
                      placeholder="Ví dụ: 12"
                    />
                  )}
                </FormField>
              </div>
              <label className="flex items-center gap-2 text-body-sm">
                <Checkbox
                  checked={teamForm.active}
                  onCheckedChange={(value) => setTeamForm({ ...teamForm, active: value === true })}
                  aria-label="Bật gửi Telegram cho Team"
                />
                Bật gửi Telegram cho Team này
              </label>
              <div>
                <Button
                  type="button"
                  disabled={!teamForm.teamId || (teamForm.active && !teamForm.topicId.trim())}
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
                data={teams.data ?? []}
                getRowId={(row) => row.id}
                loading={teams.isLoading}
                error={teams.isError}
                emptyTitle="Chưa có Team"
                emptyDescription="Tạo Team trước khi cấu hình Topic Thread ID."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outbox" className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <SectionHeader
                title="Công cụ quản trị"
                description="Chỉ Admin được vận hành hàng đợi gửi Telegram."
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  loading={reminders.isPending}
                  onClick={() => setConfirm("reminders")}
                >
                  <Bell />
                  Tạo thông báo nhắc hạn
                </Button>
                <Button
                  type="button"
                  loading={dispatch.isPending}
                  onClick={() => setConfirm("dispatch")}
                >
                  <Send />
                  Gửi thông báo đang chờ
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <DataTable
                columns={outboxColumns}
                data={outbox.data ?? []}
                getRowId={(row) => row.id}
                loading={outbox.isLoading}
                error={outbox.isError}
                emptyTitle="Hàng đợi trống"
                emptyDescription="Chưa có tin nhắn Telegram nào cần gửi."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
        title={
          confirm === "dispatch" ? "Gửi thông báo đang chờ?" : "Tạo thông báo nhắc hạn?"
        }
        description={
          confirm === "dispatch"
            ? "Hệ thống sẽ gửi các tin đang chờ trong hàng đợi tới Telegram."
            : "Hệ thống sẽ tạo tin nhắc hạn cho các thông báo nội bộ sắp đến hạn."
        }
        confirmLabel={confirm === "dispatch" ? "Gửi ngay" : "Tạo nhắc hạn"}
        onConfirm={() => {
          if (confirm === "dispatch") dispatch.mutate();
          else reminders.mutate();
          setConfirm(null);
        }}
      />
    </div>
  );
}
