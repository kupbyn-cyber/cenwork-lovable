import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/lib/permission-guard";
import { publishAnnouncementCore, resolveAudienceUserIds } from "@/lib/announcement.server";

/**
 * CEN 1.0 — M6.1 server functions cho thông báo nội bộ.
 * Phát hành phải chạy ở backend: chốt danh sách người nhận và kiểm tra lại phạm vi gửi.
 */
export const publishAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ announcementId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.ANNOUNCEMENTS_CREATE);
    return publishAnnouncementCore(context.supabase, data.announcementId, context.userId);
  });

/**
 * M6.2 — Xếp hàng nhắc hạn 24h và 2h cho người nhận chưa xác nhận.
 * Chỉ người có quyền phát hành thông báo mới được kích hoạt; database tự chống trùng.
 */
export const enqueueAnnouncementReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.ANNOUNCEMENTS_CREATE);
    const { error } = await context.supabase.rpc("announcement_enqueue_reminders");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * M6.3 — Ước tính số người nhận từ tiêu chí (tính ở server, theo quyền thật của người gọi).
 * Con số chỉ mang tính dự kiến: khi phát hành sẽ tính lại tại thời điểm đó.
 */
export const estimateAnnouncementRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userIds: z.array(z.string().uuid()).default([]),
        teamIds: z.array(z.string().uuid()).default([]),
        allUsers: z.boolean().default(false),
        allTeams: z.boolean().default(false),
        includeSelf: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.ANNOUNCEMENTS_CREATE);
    const ids = await resolveAudienceUserIds(context.supabase, context.userId, data);
    return { count: ids.length };
  });
