import { Badge } from "@/components/ui/badge";
import { EntityAvatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDate } from "@/lib/datetime";
import { ROLE_LABEL, STATUS_LABEL, type MemberRow, type TeamRow } from "@/lib/org-data";

/**
 * CEN — Chi tiết thành viên (chỉ xem).
 * Thông tin liên hệ chỉ hiển thị tại đây; vai trò hệ thống chỉ Admin/CMO thấy.
 */
export interface MemberDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: MemberRow | null;
  teams: TeamRow[];
  avatarUrl?: string | undefined;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-helper text-text-muted">{label}</span>
      <span className="min-w-0 break-words text-body text-text-primary">{value}</span>
    </div>
  );
}

export function MemberDetailModal({
  open,
  onOpenChange,
  member,
  teams,
  avatarUrl,
}: MemberDetailModalProps) {
  const access = useOrgAccess();
  if (!member) return null;

  const teamName = (id: string | null) => teams.find((team) => team.id === id)?.name ?? "—";
  const collaborators = member.collaboratorTeamIds.map(teamName);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Chi tiết thành viên"
      description="Thông tin hồ sơ và liên hệ nội bộ."
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex min-w-0 items-center gap-3">
          <EntityAvatar
            name={member.display_name}
            size="lg"
            {...(avatarUrl ? { src: avatarUrl } : {})}
          />
          <div className="min-w-0">
            <p className="truncate text-body-lg font-semibold text-text-primary">
              {member.display_name}
            </p>
            <p className="truncate text-helper text-text-secondary">{member.job_title || "—"}</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Row label="Email" value={member.email} />
          <Row label="Số điện thoại" value={member.phone_number || "—"} />
          <Row
            label="Sinh nhật"
            value={member.birthday ? formatHanoiDate(`${member.birthday}T00:00:00+07:00`) : "—"}
          />
          <Row label="Chức danh" value={member.job_title || "—"} />
          <Row label="Team chính" value={teamName(member.primary_team_id)} />
          <Row
            label="Team phối hợp"
            value={collaborators.length > 0 ? collaborators.join(", ") : "—"}
          />
          <Row
            label="Telegram"
            value={
              member.telegram_user_id
                ? `${member.telegram_user_id}${member.telegram_enabled ? "" : " (đã tắt)"}`
                : "Chưa có Telegram ID"
            }
          />
          <Row
            label="Trạng thái"
            value={
              <StatusBadge
                label={STATUS_LABEL[member.status]}
                tone={member.status === "active" ? "success" : "error"}
              />
            }
          />
          {/* Vai trò hệ thống chỉ hiển thị cho Admin và CMO. */}
          {access.isSystemAdmin ? (
            <Row
              label="Vai trò hệ thống"
              value={
                <Badge variant={member.role === "admin" ? "brand" : "neutral"}>
                  {member.role ? ROLE_LABEL[member.role] : "—"}
                </Badge>
              }
            />
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
