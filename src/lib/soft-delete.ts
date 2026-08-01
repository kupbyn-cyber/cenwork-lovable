import { supabase } from "@/integrations/supabase/client";

/**
 * CEN 1.0 — Xóa mềm Dự án và Công việc.
 * Ghi dữ liệu đi qua RPC SECURITY DEFINER `soft_delete_entity`: quyền Admin được
 * kiểm tra tại database, bản ghi chỉ được đánh dấu `deleted_at`/`deleted_by`
 * (không xóa cứng, không cascade), và hành động luôn được ghi Audit Log.
 * Helper quyền phía dưới chỉ để UI ẩn/hiện đúng.
 */
export type SoftDeleteEntityType = "task" | "project";

export async function softDeleteEntity(entityType: SoftDeleteEntityType, entityId: string) {
  const { error } = await supabase.rpc("soft_delete_entity", {
    _entity_type: entityType,
    _entity_id: entityId,
  });
  if (error) throw new Error(error.message);
}

/** Chỉ Admin được xóa mềm — CMO, Leader và Member không thấy hành động này. */
export function canSoftDelete(role: string | null) {
  return role === "admin";
}
