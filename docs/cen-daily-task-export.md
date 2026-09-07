# CEN Daily Task Export (TASK-DAILY-01A)

Xuất toàn bộ Công việc liên quan tới một **ngày nghiệp vụ** ra file Excel để phân tích bằng AI.

- Engine: `src/lib/daily-task-export.server.ts` → `generateDailyTaskReport(businessDate)`
- Server function (có xác thực): `src/lib/daily-task-export.functions.ts` → `exportDailyTasks`
- Script kiểm thử: `scripts/export-daily-tasks.ts`
- File: `CEN_DAILY_TASKS_YYYY-MM-DD.xlsx`, một sheet `Tasks`

## Business date & timezone

`business_date` dạng `YYYY-MM-DD`, hiểu là 00:00:00 → 23:59:59 theo `Asia/Ho_Chi_Minh`.
Cửa sổ được tính bằng `hanoiToUtcISO()` (`src/lib/datetime.ts`), không dùng lịch UTC.

## Task selection

Ứng viên: `tasks` chưa xóa mềm (`deleted_at IS NULL`) và `created_at < end_of_business_date`.
Một Task được include khi thuộc ít nhất một nhóm:

- **CREATED** — `created_at` trong ngày.
- **DEADLINE** — `deadline` trong ngày.
- **COMPLETED** — `completed_at` trong ngày.
- **ACTIVE** — tồn tại trong ngày và chưa hoàn thành/hủy trước 00:00 giờ Hà Nội của ngày đó.
- **OVERDUE** — `deadline < cuối ngày` và tới cuối ngày vẫn chưa hoàn thành/hủy (kể cả deadline của các ngày trước).

## Historical state reconstruction: PARTIAL

CEN không có bảng lịch sử trạng thái Task đầy đủ (`task_approval_events` chỉ ghi vòng duyệt,
`audit_logs` không đảm bảo bao phủ mọi chuyển trạng thái từ trước). Vì vậy trạng thái tại cuối
ngày chỉ được suy ra từ các mốc thời gian chứng minh được: `created_at`, `start_date`, `deadline`,
`completed_at`, `cancelled_at`.

Hệ quả (limitation):

- Task hoàn thành lúc 07:00 ngày hôm sau vẫn được coi là **chưa hoàn thành** tại cuối ngày trước
  (đúng theo yêu cầu), vì so sánh `completed_at` với cuối ngày.
- Các trạng thái trung gian (`not_started` → `in_progress` → `review`) **không** tái tạo được:
  cột `task_status` là trạng thái **hiện tại**, không phải trạng thái tại cuối ngày nghiệp vụ.
- `approval_status` cũng là giá trị hiện tại.

## Derived fields

| Field | Quy tắc |
| --- | --- |
| `created_on_business_date` | `created_at` trong ngày |
| `deadline_on_business_date` | `deadline` trong ngày |
| `completed_on_business_date` | `completed_at` trong ngày |
| `active_on_business_date` | chưa hoàn thành/hủy trước 00:00 ngày đó và đã được tạo trước cuối ngày |
| `overdue_as_of_business_date` | deadline đã qua tại cuối ngày và chưa hoàn thành/hủy tại thời điểm đó |
| `days_overdue_as_of_business_date` | số ngày (giờ Hà Nội) từ ngày deadline tới business_date, tối thiểu 0 |

Boolean ghi `TRUE` / `FALSE`.

## Column contract

Thứ tự và tên cột cố định (English snake_case), không đổi giữa các ngày:

```
business_date, exported_at,
task_id, task_name, task_status, priority, work_weight, approval_status,
created_at, start_date, deadline, completed_at, cancelled_at,
project_id, project_name, team_id, team_name,
assignee_id, assignee_name, reviewer_id, reviewer_name,
participant_ids, participant_names,
created_on_business_date, deadline_on_business_date, completed_on_business_date,
active_on_business_date, overdue_as_of_business_date, days_overdue_as_of_business_date
```

## Participants

Một dòng = một Task. Nhiều participant gộp trong cùng dòng, ngăn cách bằng `;`
(`participant_ids`, `participant_names`). Không nhân dòng.

## Human-readable enrichment

`project_name`, `team_name`, `assignee_name`, `reviewer_name`, `participant_names` được
enrich từ `projects`, `teams` và RPC `member_directory()`. UUID vẫn giữ để trace.

## Data minimization

Không xuất email, mật khẩu, token, session, secret hay thông tin cá nhân ngoài tên hiển thị.

## Scale

Đọc theo trang 1000 dòng cho tới hết; không dùng giới hạn 500 của `/api/ai/read`,
không cắt bớt ngầm.

## Permission context

Truy vấn chạy dưới danh tính viewer báo cáo hiện có (`CEN_AI_VIEWER_USER_ID`) qua
`createUserDataClient()` → RLS vẫn áp dụng, không bypass. Thiếu biến này, engine ném lỗi
`PERMISSION_GAP` thay vì tự mở quyền. Server function `exportDailyTasks` yêu cầu quyền
`settings.admin`.

## Cách test

```bash
DATABASE_URL=... CEN_AI_VIEWER_USER_ID=... bun run scripts/export-daily-tasks.ts 2026-09-06
```

Kết quả: `CEN_DAILY_TASKS_2026-09-06.xlsx` trong thư mục hiện tại.

## Known limitations

- Historical reconstruction: PARTIAL (xem phần trên).
- `task_status` / `approval_status` phản ánh hiện tại, không phải cuối ngày nghiệp vụ.
- Task xóa mềm (`deleted_at`) không xuất hiện, kể cả khi từng active trong ngày đó.
- Package này không gửi email, không lập lịch, không phân tích AI.
