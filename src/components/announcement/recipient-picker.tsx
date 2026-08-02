import * as React from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrgAccess } from "@/hooks/use-org-access";
import { supabase } from "@/integrations/supabase/client";

/**
 * CEN 1.0 — M6.1 bộ chọn người nhận.
 * NAP-01: mọi tài khoản đang hoạt động đều gửi được cho bất kỳ người/Team đang hoạt động nào.
 * Danh bạ lấy từ RPC (không lọc theo Team, dự án hay quan hệ công việc); server và RLS kiểm tra lại khi lưu/phát hành.
 */
export interface AudienceUser {
  id: string;
  display_name: string;
  email: string;
}

export interface AudienceTeam {
  id: string;
  name: string;
}

export interface RecipientScope {
  users: AudienceUser[];
  teams: AudienceTeam[];
  loading: boolean;
  error: boolean;
}

const audienceUsersQuery = () =>
  queryOptions({
    queryKey: ["announcement-audience-users"],
    queryFn: async (): Promise<AudienceUser[]> => {
      const { data, error } = await supabase.rpc("announcement_audience_users");
      if (error) throw new Error(error.message);
      return (data ?? []) as AudienceUser[];
    },
  });

const audienceTeamsQuery = () =>
  queryOptions({
    queryKey: ["announcement-audience-teams"],
    queryFn: async (): Promise<AudienceTeam[]> => {
      const { data, error } = await supabase.rpc("announcement_audience_teams");
      if (error) throw new Error(error.message);
      return (data ?? []) as AudienceTeam[];
    },
  });

export function useRecipientScope(): RecipientScope {
  const members = useQuery(audienceUsersQuery());
  const teams = useQuery(audienceTeamsQuery());

  return React.useMemo(
    () => ({
      users: members.data ?? [],
      teams: teams.data ?? [],
      loading: members.isLoading || teams.isLoading,
      error: members.isError || teams.isError,
    }),
    [members.data, members.isError, members.isLoading, teams.data, teams.isError, teams.isLoading],
  );
}


interface BulkState {
  allUsers: boolean;
  allTeams: boolean;
  includeSelf: boolean;
}

interface PickerProps {
  scope: RecipientScope;
  userIds: string[];
  teamIds: string[];
  bulk: BulkState;
  estimatedCount: number | null;
  estimating?: boolean;
  onChange: (next: { userIds: string[]; teamIds: string[] }) => void;
  onBulkChange: (next: BulkState) => void;
  disabled?: boolean;
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
}

export function RecipientPicker({
  scope,
  userIds,
  teamIds,
  bulk,
  estimatedCount,
  estimating,
  onChange,
  onBulkChange,
  disabled,
}: PickerProps) {
  const { role } = useOrgAccess();
  const canBulk = role === "admin" || role === "cmo" || role === "leader";
  const wide = role === "admin" || role === "cmo";
  const [search, setSearch] = React.useState("");

  const filteredUsers = scope.users.filter((user) =>
    `${user.display_name} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {canBulk ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-3">
          <Label className="text-label font-medium text-text-secondary">Chọn nhanh</Label>
          <label className="flex min-w-0 items-center gap-2 text-body-sm">
            <Checkbox
              checked={bulk.allUsers}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onBulkChange({ ...bulk, allUsers: checked === true })
              }
            />
            <span className="min-w-0 break-words">
              {wide ? "Tất cả mọi người" : "Tất cả người tôi có quyền gửi"}
            </span>
          </label>
          <label className="flex min-w-0 items-center gap-2 text-body-sm">
            <Checkbox
              checked={bulk.allTeams}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onBulkChange({ ...bulk, allTeams: checked === true })
              }
            />
            <span className="min-w-0 break-words">
              {wide ? "Tất cả các Team" : "Tất cả Team tôi có quyền gửi"}
            </span>
          </label>
          <label className="flex min-w-0 items-center gap-2 text-body-sm">
            <Checkbox
              checked={bulk.includeSelf}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onBulkChange({ ...bulk, includeSelf: checked === true })
              }
            />
            <span className="min-w-0 break-words">Bao gồm tôi</span>
          </label>
          <p className="text-body-sm text-text-muted">
            {estimating
              ? "Đang tính số người nhận dự kiến…"
              : estimatedCount === null
                ? "Chưa xác định số người nhận dự kiến."
                : `Dự kiến ${estimatedCount} người nhận.`}{" "}
            Với lịch phát hành hoặc chuỗi lặp, số người nhận có thể thay đổi đến thời điểm phát
            hành thực tế.
          </p>
        </div>
      ) : null}


      <div className="flex min-w-0 flex-col gap-2">
        <Label className="text-label font-medium text-text-secondary">Team nhận thông báo</Label>
        {scope.loading ? (
          <p className="text-body-sm text-text-muted">Đang tải…</p>
        ) : scope.teams.length === 0 ? (
          <p className="text-body-sm text-text-muted">Không có Team nào trong phạm vi của bạn.</p>
        ) : (
          <div className="flex max-h-40 min-w-0 flex-col gap-2 overflow-y-auto rounded-control border border-border-default p-2">
            {scope.teams.map((team) => (
              <label key={team.id} className="flex min-w-0 items-center gap-2 text-body-sm">
                <Checkbox
                  checked={teamIds.includes(team.id)}
                  disabled={disabled}
                  onCheckedChange={() => onChange({ userIds, teamIds: toggle(teamIds, team.id) })}
                />
                <span className="min-w-0 break-words">{team.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Label className="text-label font-medium text-text-secondary">
          Người nhận cụ thể
          {userIds.length > 0 ? (
            <Badge size="sm" variant="info" className="ml-2">
              {userIds.length}
            </Badge>
          ) : null}
        </Label>
        <Input
          value={search}
          disabled={disabled}
          placeholder="Tìm theo tên hoặc email"
          onChange={(event) => setSearch(event.target.value)}
        />
        {scope.loading ? (
          <p className="text-body-sm text-text-muted">Đang tải…</p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-body-sm text-text-muted">Không có người nhận phù hợp.</p>
        ) : (
          <div className="flex max-h-56 min-w-0 flex-col gap-2 overflow-y-auto rounded-control border border-border-default p-2">
            {filteredUsers.map((user) => (
              <label key={user.id} className="flex min-w-0 items-center gap-2 text-body-sm">
                <Checkbox
                  checked={userIds.includes(user.id)}
                  disabled={disabled}
                  onCheckedChange={() => onChange({ teamIds, userIds: toggle(userIds, user.id) })}
                />
                <span className="min-w-0 break-words">
                  {user.display_name}
                  <span className="text-text-muted"> · {user.email}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
