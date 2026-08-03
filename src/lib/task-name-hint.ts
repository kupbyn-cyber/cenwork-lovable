/**
 * Gợi ý đặt tên công việc theo mẫu: Động từ + Nội dung cần làm + Đối tượng/Chiến dịch.
 * Chỉ cảnh báo mềm, không chặn lưu và không tự sửa nội dung người dùng nhập.
 */

export const TASK_NAME_HELPER =
  "Đặt theo mẫu: Động từ + Nội dung cần làm + Đối tượng/Chiến dịch.";

export const TASK_NAME_PLACEHOLDER = "Ví dụ: Viết 3 kịch bản TikTok – Nướng Tự Do";

const MULTI_OUTPUT_WARNING =
  "Công việc có thể đang chứa nhiều đầu ra. Hãy cân nhắc tách thành các Task riêng.";

const UNCLEAR_WARNING =
  "Tên công việc có thể chưa thể hiện rõ việc cần làm. Ví dụ: “Viết kịch bản TikTok – Độc lạ Việt Nam”.";

const ACTION_VERBS = [
  "viết",
  "thiết kế",
  "quay",
  "chụp",
  "cập nhật",
  "kiểm tra",
  "tổng hợp",
  "liên hệ",
  "lập",
  "xây dựng",
  "đăng",
  "duyệt",
  "chuẩn bị",
];

function startsWithActionVerb(value: string) {
  const lower = value.toLocaleLowerCase("vi-VN");
  return ACTION_VERBS.some(
    (verb) => lower === verb || lower.startsWith(`${verb} `) || lower.startsWith(`${verb}\u00a0`),
  );
}

function hasMultipleOutputs(value: string) {
  const lower = value.toLocaleLowerCase("vi-VN");
  return /\+|\//.test(lower) || /(^|\s)và(\s|$)/.test(lower);
}

/** Trả về cảnh báo mềm cho tên công việc, hoặc null nếu tên đã rõ ràng. */
export function getTaskNameWarning(rawName: string): string | null {
  const name = rawName.trim();
  if (!name) return null;
  if (hasMultipleOutputs(name)) return MULTI_OUTPUT_WARNING;
  if (name.length < 8) return UNCLEAR_WARNING;
  if (!startsWithActionVerb(name)) return UNCLEAR_WARNING;
  return null;
}
