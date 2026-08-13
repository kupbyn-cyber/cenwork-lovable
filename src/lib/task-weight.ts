import type { AppRoleKey } from "@/lib/permissions";

/**
 * MVP-FIX-03 — Trọng số công việc: độc lập hoàn toàn với Mức ưu tiên.
 * Chỉ 4 mức hợp lệ; mặc định Vừa (2). Mức Trọng điểm (5) do Leader/CMO/Admin đặt.
 */
export type TaskWorkWeight = 1 | 2 | 3 | 5;

export const TASK_WEIGHT_DEFAULT: TaskWorkWeight = 2;

export const TASK_WEIGHT_ORDER: TaskWorkWeight[] = [1, 2, 3, 5];

export const TASK_WEIGHT_NAME: Record<TaskWorkWeight, string> = {
  1: "Nhỏ",
  2: "Vừa",
  3: "Lớn",
  5: "Trọng điểm",
};

/** Nhãn trong form: "Nhỏ (1)". */
export function taskWeightOptionLabel(weight: TaskWorkWeight) {
  return `${TASK_WEIGHT_NAME[weight]} (${weight})`;
}

/** Nhãn badge trong danh sách/chi tiết: "Nhỏ · 1". */
export function taskWeightBadgeLabel(weight: number) {
  const value = normalizeTaskWeight(weight);
  return `${TASK_WEIGHT_NAME[value]} · ${value}`;
}

export const TASK_WEIGHT_SHORT_NOTE =
  "Lưu ý: Chọn trọng số theo khối lượng, độ phức tạp và mức độ đóng góp của công việc; không theo độ gấp.";

export const TASK_WEIGHT_DESCRIPTION: Record<TaskWorkWeight, string> = {
  1: "Việc đơn giản, phạm vi hẹp, ít bước xử lý.",
  2: "Việc tiêu chuẩn, khối lượng vừa phải, trách nhiệm thông thường.",
  3: "Việc nhiều bước, cần phối hợp hoặc chuyên môn, tác động rõ đến kết quả.",
  5: "Việc quan trọng, phức tạp cao, trách nhiệm lớn, tác động lớn đến mục tiêu chung.",
};

export function normalizeTaskWeight(value: unknown): TaskWorkWeight {
  const num = Number(value);
  return num === 1 || num === 2 || num === 3 || num === 5 ? (num as TaskWorkWeight) : TASK_WEIGHT_DEFAULT;
}

/** Mức Trọng điểm (5) chỉ dành cho Leader/CMO/Admin — database kiểm tra lại khi ghi. */
export function canSetTaskWeight(role: AppRoleKey | null, weight: TaskWorkWeight) {
  if (weight !== 5) return true;
  return role === "admin" || role === "cmo" || role === "leader";
}

export function taskWeightOptions(role: AppRoleKey | null): TaskWorkWeight[] {
  return TASK_WEIGHT_ORDER.filter((weight) => canSetTaskWeight(role, weight));
}

