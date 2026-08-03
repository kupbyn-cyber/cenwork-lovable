import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, TableCellStack, TableRowActions } from "@/components/ui/data-table";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import {
  facilitiesQuery,
  membersQuery,
  saveFacility,
  saveTeam,
  teamsQuery,
  type FacilityRow,
  type TeamRow,
} from "@/lib/org-data";

const NO_LEADER = "__none__";

export function TeamsSection() {
  const access = useOrgAccess();
  const queryClient = useQueryClient();
  const teamsResult = useQuery(teamsQuery());
  const membersResult = useQuery(membersQuery());

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TeamRow | null>(null);
  const [name, setName] = React.useState("");
  const [leaderId, setLeaderId] = React.useState(NO_LEADER);
  const [topicId, setTopicId] = React.useState("");
  const [telegramEnabled, setTelegramEnabled] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const teams = teamsResult.data ?? [];
  const members = membersResult.data ?? [];

  function openForm(team: TeamRow | null) {
    setEditing(team);
    setName(team?.name ?? "");
    setLeaderId(team?.leader_id ?? NO_LEADER);
    setTopicId(team?.telegram_topic_id ?? "");
    setTelegramEnabled(team?.telegram_enabled ?? false);
    setError(null);
    setOpen(true);
  }

  /** Một Leader chỉ quản lý một Team: loại các Leader đã gắn Team khác. */
  const leaderOptions = members.filter(
    (member) =>
      member.role === "leader" &&
      !teams.some((team) => team.leader_id === member.id && team.id !== editing?.id),
  );

  const mutation = useMutation({
    mutationFn: () =>
      saveTeam({
        ...(editing ? { id: editing.id } : {}),
        name: name.trim(),
        leader_id: leaderId === NO_LEADER ? null : leaderId,
        telegram_topic_id: topicId.trim() || null,
        telegram_enabled: telegramEnabled,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: ["telegram-teams"] });
      cenToast.success(editing ? "Đã cập nhật Team." : "Đã tạo Team mới.");
      setOpen(false);
    },
    onError: (err: Error) =>
      setError(
        err.message.includes("duplicate") || err.message.includes("unique")
          ? "Tên Team hoặc Leader này đã được sử dụng."
          : err.message,
      ),
  });

  const memberCount = (teamId: string) =>
    members.filter((member) => member.primary_team_id === teamId).length;

  const columns = [
    {
      id: "name",
      header: "Team",
      className: "min-w-[200px]",
      cell: (row: TeamRow) => (
        <TableCellStack
          primary={row.name}
          secondary={`${memberCount(row.id)} thành viên chính thức`}
        />
      ),
    },
    {
      id: "leader",
      header: "Leader",
      className: "min-w-[200px]",
      cell: (row: TeamRow) => {
        const leader = members.find((member) => member.id === row.leader_id);
        return leader ? (
          <TableCellStack primary={leader.display_name} secondary={leader.email} />
        ) : (
          <StatusBadge label="Chưa có Leader" tone="warning" />
        );
      },
    },
    ...(access.canManageOrg
      ? [
          {
            id: "actions",
            header: "Thao tác",
            align: "right" as const,
            className: "min-w-[100px]",
            cell: (row: TeamRow) => (
              <TableRowActions>
                <Button variant="ghost" size="sm" type="button" onClick={() => openForm(row)}>
                  <Pencil /> Sửa
                </Button>
              </TableRowActions>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <SectionHeader
          title="Team"
          description="Mỗi Team có tối đa một Leader; một Leader chỉ quản lý một Team."
          actions={
            access.canManageOrg ? (
              <Button size="sm" type="button" onClick={() => openForm(null)}>
                <Plus /> Thêm Team
              </Button>
            ) : null
          }
        />
        <DataTable
          columns={columns}
          data={teams}
          getRowId={(row) => row.id}
          density="compact"
          loading={teamsResult.isLoading}
          error={teamsResult.isError}
          onRetry={() => void teamsResult.refetch()}
          errorTitle="Không tải được danh sách Team"
          emptyTitle="Chưa có Team"
          emptyDescription="Tạo Team đầu tiên để bắt đầu phân nhóm nhân sự."
          caption="Danh sách Team"
        />
      </CardContent>

      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!mutation.isPending) setOpen(next);
        }}
        title={editing ? "Sửa Team" : "Thêm Team"}
        description="Tên Team không được trùng trong hệ thống."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Hủy
            </Button>
            <Button type="submit" form="team-form" loading={mutation.isPending}>
              Lưu
            </Button>
          </>
        }
      >
        <form
          id="team-form"
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError("Vui lòng nhập tên Team.");
              return;
            }
            if (telegramEnabled && !topicId.trim()) {
              setError("Cần nhập Telegram Topic Thread ID trước khi bật gửi Telegram.");
              return;
            }
            setError(null);
            mutation.mutate();
          }}
        >
          <FormField id="team-name" label="Tên Team" required>
            {(controlProps) => (
              <Input
                {...controlProps}
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </FormField>
          <FormField
            id="team-leader"
            label="Leader"
            helperText="Chỉ hiển thị thành viên có vai trò Leader và chưa quản lý Team khác."
          >
            {(controlProps) => (
              <Select value={leaderId} onValueChange={setLeaderId}>
                <SelectTrigger id={controlProps.id} aria-describedby={controlProps["aria-describedby"]}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LEADER}>Chưa chỉ định</SelectItem>
                  {leaderOptions.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.display_name}
                      {member.email ? ` — ${member.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField
            id="team-telegram-topic"
            label="Telegram Topic Thread ID"
            helperText="Topic riêng của Team trong Group Chat chung. Bắt buộc nếu bật gửi Telegram."
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={topicId}
                maxLength={32}
                placeholder="Ví dụ: 12"
                onChange={(e) => setTopicId(e.target.value)}
              />
            )}
          </FormField>
          <label className="flex min-w-0 items-center gap-2.5 text-label text-text-primary">
            <Checkbox
              checked={telegramEnabled}
              onCheckedChange={(value) => setTelegramEnabled(value === true)}
            />
            <span className="min-w-0">Bật gửi Telegram cho Team này</span>
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-control border border-state-danger/50 bg-state-danger-surface px-3 py-2 text-helper text-state-danger"
            >
              {error}
            </p>
          ) : null}
        </form>
      </Modal>
    </Card>
  );
}

export function FacilitiesSection() {
  const access = useOrgAccess();
  const queryClient = useQueryClient();
  const facilitiesResult = useQuery(facilitiesQuery());

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FacilityRow | null>(null);
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  function openForm(facility: FacilityRow | null) {
    setEditing(facility);
    setName(facility?.name ?? "");
    setAddress(facility?.address ?? "");
    setIsActive(facility?.is_active ?? true);
    setError(null);
    setOpen(true);
  }

  const mutation = useMutation({
    mutationFn: () =>
      saveFacility({
        ...(editing ? { id: editing.id } : {}),
        name: name.trim(),
        address: address.trim(),
        is_active: isActive,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["facilities"] });
      cenToast.success(editing ? "Đã cập nhật cơ sở." : "Đã thêm cơ sở mới.");
      setOpen(false);
    },
    onError: (err: Error) =>
      setError(
        err.message.includes("duplicate") || err.message.includes("unique")
          ? "Tên cơ sở này đã tồn tại."
          : err.message,
      ),
  });

  const columns = [
    {
      id: "name",
      header: "Cơ sở",
      className: "min-w-[200px]",
      cell: (row: FacilityRow) => <TableCellStack primary={row.name} secondary={row.address} />,
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[120px]",
      cell: (row: FacilityRow) => (
        <StatusBadge
          label={row.is_active ? "Đang hoạt động" : "Ngừng hoạt động"}
          tone={row.is_active ? "success" : "neutral"}
        />
      ),
    },
    ...(access.canManageOrg
      ? [
          {
            id: "actions",
            header: "Thao tác",
            align: "right" as const,
            className: "min-w-[100px]",
            cell: (row: FacilityRow) => (
              <TableRowActions>
                <Button variant="ghost" size="sm" type="button" onClick={() => openForm(row)}>
                  <Pencil /> Sửa
                </Button>
              </TableRowActions>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <SectionHeader
          title="Cơ sở"
          description="Danh mục địa điểm độc lập, không gắn mặc định với thành viên."
          actions={
            access.canManageOrg ? (
              <Button size="sm" type="button" onClick={() => openForm(null)}>
                <Plus /> Thêm cơ sở
              </Button>
            ) : null
          }
        />
        <DataTable
          columns={columns}
          data={facilitiesResult.data ?? []}
          getRowId={(row) => row.id}
          density="compact"
          loading={facilitiesResult.isLoading}
          error={facilitiesResult.isError}
          onRetry={() => void facilitiesResult.refetch()}
          errorTitle="Không tải được danh sách cơ sở"
          emptyTitle="Chưa có cơ sở"
          emptyDescription="Thêm cơ sở để dùng cho các module vận hành sau này."
          caption="Danh sách cơ sở"
        />
      </CardContent>

      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!mutation.isPending) setOpen(next);
        }}
        title={editing ? "Sửa cơ sở" : "Thêm cơ sở"}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Hủy
            </Button>
            <Button type="submit" form="facility-form" loading={mutation.isPending}>
              Lưu
            </Button>
          </>
        }
      >
        <form
          id="facility-form"
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError("Vui lòng nhập tên cơ sở.");
              return;
            }
            setError(null);
            mutation.mutate();
          }}
        >
          <FormField id="facility-name" label="Tên cơ sở" required>
            {(controlProps) => (
              <Input
                {...controlProps}
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </FormField>
          <FormField id="facility-address" label="Địa chỉ">
            {(controlProps) => (
              <Input
                {...controlProps}
                value={address}
                maxLength={200}
                onChange={(e) => setAddress(e.target.value)}
              />
            )}
          </FormField>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <label htmlFor="facility-active" className="text-label text-text-primary">
              Đang hoạt động
            </label>
            <Switch id="facility-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-control border border-state-danger/50 bg-state-danger-surface px-3 py-2 text-helper text-state-danger"
            >
              {error}
            </p>
          ) : null}
        </form>
      </Modal>
    </Card>
  );
}
