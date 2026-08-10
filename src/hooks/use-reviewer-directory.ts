import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import { EMPTY_REVIEWER_DIRECTORY, type ReviewerDirectory } from "@/lib/report-data";

interface DirectoryRow {
  id: string;
  display_name: string | null;
  role: string | null;
  status: string;
  primary_team_id: string | null;
  leader_of_team: string | null;
}

/**
 * REPORT-FINAL-QA-FIX-01 — danh bạ người duyệt lấy qua RPC bảo mật
 * `report_reviewer_directory`, vì `member_directory` che vai trò hệ thống với
 * Leader/Member khiến không tìm được CMO khi Leader gửi báo cáo.
 */
export function useReviewerDirectory(): ReviewerDirectory {
  const query = useQuery({
    queryKey: ["reviewer-directory"],
    staleTime: 60_000,
    queryFn: async (): Promise<ReviewerDirectory> => {
      const { data, error } = await supabase.rpc("report_reviewer_directory");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as DirectoryRow[];
      return {
        members: rows.map((row) => ({
          id: row.id,
          role: (row.role as ReviewerDirectory["members"][number]["role"]) ?? null,
          status: row.status,
          primary_team_id: row.primary_team_id,
          display_name: row.display_name,
        })),
        teams: rows
          .filter((row) => row.leader_of_team)
          .map((row) => ({ id: row.leader_of_team as string, leader_id: row.id })),
      };
    },
  });
  return query.data ?? EMPTY_REVIEWER_DIRECTORY;
}
