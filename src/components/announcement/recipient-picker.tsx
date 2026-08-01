import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrgAccess } from "@/hooks/use-org-access";
import { membersQuery, teamsQuery, type MemberRow, type TeamRow } from "@/lib/org-data";

/**
 * CEN 1.0 — M6.1 bộ chọn người nhận.
 * UI chỉ hiển thị đối tượng hợp lệ theo vai trò; server và RLS kiểm tra lại khi lưu/phát hành.
 */
export interface RecipientScope {
  users: MemberRow[];
  teams: TeamRow[];
  loading: boolean;
  error: boolean;
}

export function useRecipientScope(): RecipientScope {
  const { role, leaderTeamId, userId } = useOrgAccess();
  const members = useQuery(membersQuery());
  const teams = useQuery(teamsQuery());

  const allMembers = React.useMemo(() => members.data ?? [], [members.data]);
  const allTeams = React.useMemo(() => teams.data ?? [], [teams.data]);

  return React.useMemo(() => {
    const loading = members.isLoading || teams.isLoading;
    const error = members.isError || teams.isError;
    if (role === "admin" || role === "cmo") {
      return { users: allMembers, teams: allTeams, loading, error };
    }

    const me = allMembers.find((member) => member.id === userId);
    const myTeamIds = new Set<string>(
      [
        me?.primary_team_id ?? null,
        leaderTeamId,
        ...(me?.collaboratorTeamIds ?? []),
      ].filter((value): value is string => Boolean(value)),
    );

    const scopedTeams = allTeams.filter((team) => myTeamIds.has(team.id));
    const scopedUsers = allMembers.filter(
      (member) =>
        member.id === userId ||
        (member.primary_team_id && myTeamIds.has(member.primary_team_id)) ||
        member.collaboratorTeamIds.some((id) => myTeamIds.has(id)),
    );
    return { users: scopedUsers, teams: scopedTeams, loading, error };
  }, [allMembers, allTeams, leaderTeamId, members.isError, members.isLoading, role, teams.isError, teams.isLoading, userId]);
}

interface PickerProps {
  scope: RecipientScope;
  userIds: string[];
  teamIds: string[];
  onChange: (next: { userIds: string[]; teamIds: string[] }) => void;
  disabled?: boolean;
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
}

export function RecipientPicker({ scope, userIds, teamIds, onChange, disabled }: PickerProps) {
  const [search, setSearch] = React.useState("");

  const filteredUsers = scope.users.filter((user) =>
    `${user.display_name} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
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
