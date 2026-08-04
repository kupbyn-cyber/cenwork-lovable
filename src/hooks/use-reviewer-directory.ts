import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { membersQuery, teamsQuery } from "@/lib/org-data";
import type { ReviewerDirectory } from "@/lib/report-data";

/**
 * REPORT-REVIEW-UI-01 — dữ liệu tối thiểu để xác định người duyệt hiện tại
 * của từng báo cáo (vai trò người gửi, Team chính, Leader của Team).
 */
export function useReviewerDirectory(): ReviewerDirectory {
  const members = useQuery(membersQuery());
  const teams = useQuery(teamsQuery());
  return React.useMemo(
    () => ({
      members: (members.data ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        status: m.status,
        primary_team_id: m.primary_team_id,
        display_name: m.display_name,
      })),
      teams: (teams.data ?? []).map((t) => ({ id: t.id, leader_id: t.leader_id })),
    }),
    [members.data, teams.data],
  );
}
