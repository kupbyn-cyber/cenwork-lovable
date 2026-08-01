import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/lib/permission-guard";

/**
 * CEN — server function cho hành động "Tạo dự án" (dùng chung cho mọi vai trò).
 * Quyền `projects.create` được chốt ở backend trước khi ghi; luồng phê duyệt
 * (Admin/CMO duyệt ngay, Leader → CMO, Member → Leader → CMO) do hàm
 * `project_submit` trong database quyết định.
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
  responsibleTeamId: z.string().uuid().nullable().default(null),
  /** true = gửi duyệt ngay sau khi tạo; false = lưu bản nháp. */
  submit: z.boolean().default(true),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createProjectSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.PROJECTS_CREATE);

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
        responsible_team_id: data.responsibleTeamId,
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

    let status = "idea";
    if (data.submit) {
      const { data: next, error: submitError } = await context.supabase.rpc("project_submit", {
        _project: projectId,
      });
      if (submitError) throw new Error(submitError.message);
      status = (next as string) ?? "idea";
    }

    return { projectId, status };
  });
