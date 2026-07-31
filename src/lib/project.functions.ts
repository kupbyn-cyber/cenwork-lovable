import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/lib/permission-guard";

/**
 * CEN 1.0 — M2 server function cho hành động "Tạo dự án".
 * Khác với "Gửi ý tưởng" (ghi trực tiếp qua RLS), hành động này yêu cầu quyền
 * riêng `projects.create_official` và được chốt ở backend trước khi ghi.
 * Ghi dữ liệu vẫn đi qua phiên của người gọi nên RLS và trigger vẫn là ràng buộc cuối.
 */
const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(2000),
  description: z.string().trim().max(4000).nullable(),
  ownerId: z.string().uuid().nullable(),
  startDate: z.string().date().nullable(),
  deadline: z.string().date().nullable(),
  teamIds: z.array(z.string().uuid()).max(50).default([]),
  memberIds: z.array(z.string().uuid()).max(200).default([]),
  facilityIds: z.array(z.string().uuid()).max(50).default([]),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createProjectSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.PROJECTS_CREATE_OFFICIAL);

    if (data.startDate && data.deadline && data.deadline < data.startDate) {
      throw new Error("Deadline không được trước ngày bắt đầu.");
    }

    const { data: created, error } = await context.supabase
      .from("projects")
      .insert({
        name: data.name,
        objective: data.objective,
        description: data.description,
        owner_id: data.ownerId,
        start_date: data.startDate,
        deadline: data.deadline,
        created_by: context.userId,
        status: "idea",
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Không tạo được dự án.");

    const projectId = created.id as string;

    async function insertLinks(
      table: "project_teams" | "project_members" | "project_facilities",
      rows: Record<string, string>[],
    ) {
      if (rows.length === 0) return;
      const { error: linkError } = await context.supabase.from(table).insert(rows);
      if (linkError) throw new Error(linkError.message);
    }

    await insertLinks(
      "project_teams",
      data.teamIds.map((teamId) => ({ project_id: projectId, team_id: teamId })),
    );
    await insertLinks(
      "project_members",
      data.memberIds.map((userId) => ({ project_id: projectId, user_id: userId })),
    );
    await insertLinks(
      "project_facilities",
      data.facilityIds.map((facilityId) => ({ project_id: projectId, facility_id: facilityId })),
    );

    return { projectId };
  });
