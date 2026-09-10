/**
 * CEN-REPORT-SHIFT-01 — Yêu cầu Daily Report theo trạng thái ca làm việc.
 *
 * Nguồn trạng thái duy nhất: `daily_work_records.day_status` (WORKDAY-01) của
 * đúng Business Date đang xét — không lưu lại/suy đoán riêng ở đây.
 *
 * Business Rule:
 * - CONFIRMED_SHIFT (day_status = 'working')  -> Daily Report BẮT BUỘC.
 * - NO_SHIFT       (day_status = 'day_off')    -> Daily Report KHÔNG bắt buộc.
 * - NOT_CONFIRMED  (chưa có bản ghi ngày đó)   -> Daily Report KHÔNG bắt buộc.
 *
 * Vì trạng thái được đọc trực tiếp mỗi lần tính toán (không cache theo request
 * trước đó), khi ca chuyển NOT_CONFIRMED/NO_SHIFT -> CONFIRMED_SHIFT thì yêu cầu
 * có hiệu lực ngay từ lần tính tiếp theo; chiều ngược lại thì hết bắt buộc
 * nhưng report đã gửi trước đó không bị xoá hay ẩn.
 */
export type ShiftConfirmationState = "CONFIRMED_SHIFT" | "NO_SHIFT" | "NOT_CONFIRMED";

export function shiftConfirmationStateOf(
  dayStatus: string | null | undefined,
): ShiftConfirmationState {
  if (dayStatus === "working") return "CONFIRMED_SHIFT";
  if (dayStatus === "day_off") return "NO_SHIFT";
  return "NOT_CONFIRMED";
}

/** Predicate duy nhất: Daily Report có bắt buộc trong ngày đang xét hay không. */
export function isDailyReportRequiredForShift(dayStatus: string | null | undefined): boolean {
  return shiftConfirmationStateOf(dayStatus) === "CONFIRMED_SHIFT";
}
