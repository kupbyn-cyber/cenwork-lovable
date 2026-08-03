import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { recognitionTeamPulseQuery } from "@/lib/recognition-data";

/**
 * RECOGNITION-01 — thống kê tuần theo Team ("Không ai bị bỏ quên").
 * Tự ghi nhận không được tính vào "được đồng đội ghi nhận".
 */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-card border border-border-default bg-state-neutral-surface px-3 py-2">
      <p className="text-caption uppercase text-text-muted">{label}</p>
      <p className="text-h3 tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

export function RecognitionTeamPulseCard({ teamId = null }: { teamId?: string | null }) {
  const { data, isLoading, isError, refetch } = useQuery(recognitionTeamPulseQuery(teamId));

  if (isLoading) return <SkeletonCard lines={3} />;
  if (isError) {
    return (
      <Card>
        <CardContent className="pt-(--card-pad)">
          <ErrorState onRetry={() => void refetch()} />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const allCovered = data.active_members > 0 && data.missing_members === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <Users className="size-icon-sm shrink-0" />
          <span className="min-w-0 truncate">Tuần này · {data.team_name ?? "Team của tôi"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat label="Lời ghi nhận" value={data.total_count} />
          <Stat label="Được đồng đội ghi nhận" value={data.peer_recognized_members} />
          <Stat label="Thành viên hoạt động" value={data.active_members} />
          <Stat label="Chưa được ghi nhận" value={data.missing_members} />
        </div>
        <p
          className={
            allCovered
              ? "rounded-card border border-state-success/35 bg-state-success-surface px-3 py-2 text-body text-state-success"
              : "rounded-card border border-border-default bg-state-neutral-surface px-3 py-2 text-body text-text-secondary"
          }
        >
          {allCovered
            ? "🎉 Tuần không ai bị bỏ quên."
            : `${data.missing_members} thành viên chưa nhận lời ghi nhận từ đồng đội trong tuần.`}
        </p>
        {data.self_count > 0 ? (
          <p className="text-helper text-text-muted">
            Trong đó có {data.self_count} lời tự ghi nhận — không tính vào chỉ số “được đồng đội ghi
            nhận”.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}