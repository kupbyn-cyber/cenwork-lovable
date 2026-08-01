import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/lib/permission-guard";
import { computeCycleScores, refreshAwardProposals, snapshotCycleTasks } from "@/lib/mvp.server";
import { canTransitionCycle, MVP_CYCLE_STATUS_LABEL } from "@/lib/mvp-scoring";

/**
 * CEN 1.0 — M6 server functions.
 * Các thao tác vận hành kỳ MVP (thu thập dữ liệu, tính điểm, đề xuất và công bố)
 * đều chốt quyền ở backend trước khi ghi; RLS vẫn kiểm tra độc lập.
 */

const cycleIdSchema = z.object({ cycleId: z.string().uuid() });

export const createMvpCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ weekStart: z.string().date() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.MVP_MANAGE);

    const start = new Date(`${data.weekStart}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const weekEnd = end.toISOString().slice(0, 10);

    const { data: created, error } = await context.supabase
      .from("mvp_cycles")
      .insert({
        week_start: data.weekStart,
        week_end: weekEnd,
        created_by: context.userId,
        status: "collecting",
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Không tạo được kỳ MVP.");

    await snapshotCycleTasks(context.supabase, created.id);
    return { cycleId: created.id as string };
  });

export const collectCycleData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cycleIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.MVP_MANAGE);
    return snapshotCycleTasks(context.supabase, data.cycleId);
  });

export const recomputeCycleScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cycleIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.MVP_MANAGE);
    const result = await computeCycleScores(context.supabase, data.cycleId);
    return { scored: result.scored };
  });

export const generateAwardProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cycleIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.MVP_APPROVE);
    return refreshAwardProposals(context.supabase, data.cycleId);
  });

export const setCycleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        cycleId: z.string().uuid(),
        status: z.enum(["collecting", "voting", "reviewing", "pending_publish", "published"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      data.status === "published" ? PERMISSIONS.MVP_APPROVE : PERMISSIONS.MVP_MANAGE,
    );

    const { data: cycle, error: readError } = await context.supabase
      .from("mvp_cycles")
      .select("id,status")
      .eq("id", data.cycleId)
      .single();
    if (readError || !cycle) throw new Error(readError?.message ?? "Không tìm thấy kỳ MVP.");

    if (!canTransitionCycle(cycle.status, data.status)) {
      throw new Error(
        `Không thể chuyển từ ${MVP_CYCLE_STATUS_LABEL[cycle.status]} sang ${MVP_CYCLE_STATUS_LABEL[data.status]}.`,
      );
    }

    const now = new Date().toISOString();
    const voteCloses = new Date();
    voteCloses.setDate(voteCloses.getDate() + 2);
    const patch = {
      status: data.status,
      ...(data.status === "voting"
        ? { vote_opens_at: now, vote_closes_at: voteCloses.toISOString() }
        : {}),
      ...(data.status === "reviewing" ? { data_locked_at: now } : {}),
      ...(data.status === "published" ? { published_at: now, published_by: context.userId } : {}),
    };

    const { error } = await context.supabase
      .from("mvp_cycles")
      .update(patch)
      .eq("id", data.cycleId);
    if (error) throw new Error(error.message);

    if (data.status === "reviewing") {
      await context.supabase
        .from("mvp_cycle_tasks")
        .update({ is_locked: true })
        .eq("cycle_id", data.cycleId);
    }

    if (data.status === "published") {
      await context.supabase
        .from("mvp_award_results")
        .update({ status: "published", published_at: now })
        .eq("cycle_id", data.cycleId)
        .eq("status", "approved");
    }

    return { status: data.status };
  });

export const decideAward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        awardId: z.string().uuid(),
        decision: z.enum(["approved", "not_awarded"]),
        reason: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.MVP_APPROVE);

    const patch = {
      status: data.decision,
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
      ...(data.decision === "not_awarded" ? { recipient_id: null } : {}),
      ...(data.reason ? { reason: data.reason } : {}),
    };

    const { error } = await context.supabase
      .from("mvp_award_results")
      .update(patch)
      .eq("id", data.awardId);
    if (error) throw new Error(error.message);
    return { decision: data.decision };
  });
