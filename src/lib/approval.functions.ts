import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireCenAuth } from "@/lib/auth/cen-auth-middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/lib/permission-guard";
import {
  createApprovalRequest,
  decideApproval,
  replaceApprover,
  resubmitApproval,
  withdrawApproval,
} from "@/lib/approval.server";

/**
 * NAP-03 — Server functions cho Yêu cầu phê duyệt.
 * Quyền phê duyệt KHÔNG dựa vào role: database function kiểm tra người gọi có nằm
 * trong danh sách người phê duyệt pending của phiên bản hiện tại hay không.
 */
export const createApproval = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(1, "Tiêu đề không được để trống"),
        content: z.string().default(""),
        dueAt: z.string().min(1),
        mode: z.enum(["any_one", "all_required"]),
        approverIds: z.array(z.string().uuid()).min(1, "Phải chọn ít nhất một người phê duyệt"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.APPROVALS_CREATE);
    return createApprovalRequest(context.supabase, context.userId, data);
  });

export const decideApprovalRequest = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.APPROVALS_VIEW);
    return decideApproval(context.supabase, data.requestId, data.approve, data.note);
  });

export const withdrawApprovalRequest = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ requestId: z.string().uuid(), reason: z.string().nullable().default(null) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.APPROVALS_VIEW);
    return withdrawApproval(context.supabase, data.requestId, data.reason);
  });

export const resubmitApprovalRequest = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        title: z.string().trim().min(1),
        content: z.string().default(""),
        dueAt: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.APPROVALS_CREATE);
    return resubmitApproval(context.supabase, data.requestId, data);
  });

export const replaceApprovalApprover = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        oldApproverId: z.string().uuid(),
        newApproverId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.APPROVALS_VIEW);
    return replaceApprover(
      context.supabase,
      data.requestId,
      data.oldApproverId,
      data.newApproverId,
    );
  });
