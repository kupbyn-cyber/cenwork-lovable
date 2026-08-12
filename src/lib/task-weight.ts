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

export const TASK_WEIGHT_HELPER =
  "Trọng số phản ánh khối lượng và mức đóng góp của công việc khi đánh giá hiệu suất. Không phải mức độ khẩn cấp.";

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
