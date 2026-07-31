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

    function check(error: { message: string } | null) {
      if (error) throw new Error(error.message);
    }

    if (data.teamIds.length > 0) {
      const { error: teamError } = await context.supabase
        .from("project_teams")
        .insert(data.teamIds.map((teamId) => ({ project_id: projectId, team_id: teamId })));
      check(teamError);
    }
    if (data.memberIds.length > 0) {
      const { error: memberError } = await context.supabase
        .from("project_members")
        .insert(data.memberIds.map((userId) => ({ project_id: projectId, user_id: userId })));
      check(memberError);
    }
    if (data.facilityIds.length > 0) {
      const { error: facilityError } = await context.supabase
        .from("project_facilities")
        .insert(
          data.facilityIds.map((facilityId) => ({
            project_id: projectId,
            facility_id: facilityId,
          })),
        );
      check(facilityError);
    }

    return { projectId };
  });
