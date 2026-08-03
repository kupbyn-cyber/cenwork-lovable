import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/components/ui/section-header";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { formatHanoiDateTime } from "@/lib/datetime";
import { activeMembersQuery } from "@/lib/org-data";
import { castVote, myVoteQuery, type MvpCycleRow } from "@/lib/mvp-data";
import { MVP_VOTE_MIN_REASON } from "@/lib/mvp-scoring";

/**
 * CEN 1.0 — M6 khối bỏ phiếu.
 * Mỗi người một phiếu mỗi kỳ, không tự bầu, lý do tối thiểu 20 ký tự.
 * Danh tính người bầu không hiển thị ở bất kỳ đâu ngoài phiếu của chính mình.
 */
export interface VotePanelProps {
  cycle: MvpCycleRow;
  userId: string | null;
  canVote: boolean;
}

export function VotePanel({ cycle, userId, canVote }: VotePanelProps) {
  const queryClient = useQueryClient();
  const members = useQuery(activeMembersQuery());
  const myVote = useQuery(myVoteQuery(cycle.id, userId));

  const [voteeId, setVoteeId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<{ votee?: string; reason?: string }>({});

  const candidates = (members.data ?? []).filter(
    (member) => member.status === "active" && member.id !== userId,
  );

  const mutation = useMutation({
    mutationFn: () =>
      castVote({
        cycleId: cycle.id,
        voterId: userId as string,
        voteeId,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mvp-my-vote", cycle.id, userId] });
      setVoteeId("");
      setReason("");
      cenToast.success("Đã ghi nhận phiếu bầu của bạn");
    },
    onError: (error: Error) => cenToast.error("Không gửi được phiếu", { description: error.message }),
  });

  function submit() {
    const next: { votee?: string; reason?: string } = {};
    if (!voteeId) next.votee = "Chọn người bạn muốn bầu";
    if (reason.trim().length < MVP_VOTE_MIN_REASON) {
      next.reason = `Lý do cần tối thiểu ${MVP_VOTE_MIN_REASON} ký tự`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate();
  }

  if (cycle.status !== "voting") {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="Chưa đến thời gian bỏ phiếu"
            description="Phiếu bầu chỉ mở khi kỳ ở trạng thái Đang mở vote."
          />
        </CardContent>
      </Card>
    );
  }

  if (myVote.data) {
    const votee = candidates.find((member) => member.id === myVote.data?.votee_id);
    return (
      <Card>
        <CardContent className="flex min-w-0 flex-col gap-2">
          <SectionHeader
            title="Bạn đã bỏ phiếu cho kỳ này"
            description={`Ghi nhận lúc ${formatHanoiDateTime(myVote.data.created_at)}`}
          />
          <p className="text-body text-text-primary">
            Người được bầu: {votee?.display_name ?? "Thành viên"}
          </p>
          <p className="text-helper text-text-muted">Lý do: {myVote.data.reason}</p>
          <p className="text-caption text-text-muted">
            Mỗi người chỉ có một phiếu mỗi kỳ và không thể thay đổi sau khi gửi.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <SectionHeader
          title="Bỏ phiếu đồng đội"
          description="Chọn một người bạn cho rằng xứng đáng nhất tuần này và nêu lý do cụ thể."
        />
        <FormField id="mvp-votee" label="Người được bầu" required error={errors.votee}>
          {(control) => (
            <Select value={voteeId} onValueChange={setVoteeId} disabled={!canVote}>
              <SelectTrigger id={control.id} aria-describedby={control["aria-describedby"]}>
                <SelectValue placeholder="Chọn thành viên" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField
          id="mvp-vote-reason"
          label="Lý do"
          required
          helperText={`Tối thiểu ${MVP_VOTE_MIN_REASON} ký tự, nêu việc cụ thể đã quan sát được.`}
          error={errors.reason}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={reason}
              disabled={!canVote}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FormField>
        <div>
          <Button onClick={submit} loading={mutation.isPending} disabled={!canVote}>
            Gửi phiếu bầu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
