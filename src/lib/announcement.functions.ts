import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/lib/permission-guard";
import { publishAnnouncementCore } from "@/lib/announcement.server";

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
