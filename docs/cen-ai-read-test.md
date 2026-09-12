# CEN-AI-READ-01 — Hướng dẫn test nhanh

## 1. Biến môi trường (server, không đưa lên frontend)

```
CEN_AI_READ_KEY=<chuỗi ngẫu nhiên, openssl rand -hex 32>
CEN_AI_VIEWER_USER_ID=<UUID user CEN mà CEN Analyst đại diện>
DATABASE_URL=<đã có sẵn trên bản self-host>
```

Dữ liệu trả về đúng bằng phạm vi quyền của `CEN_AI_VIEWER_USER_ID` (RLS hiện có).

## 2. Endpoint

```
POST https://<domain-production-CEN>/api/ai/read
Authorization: Bearer $CEN_AI_READ_KEY
Content-Type: application/json
```

## 3. Ví dụ curl

```bash
# Tasks quá hạn trong khoảng ngày
curl -s -X POST https://<domain>/api/ai/read \
  -H "Authorization: Bearer $CEN_AI_READ_KEY" \
  -H "Content-Type: application/json" \
  -d '{"resource":"tasks","filters":{"overdue":true,"from":"2026-08-01","to":"2026-08-14"},
       "sort":{"field":"deadline","direction":"asc"},"limit":100,"offset":0}'

# Dự án đang hoạt động
curl ... -d '{"resource":"projects","filters":{"status":"in_progress"}}'

# Báo cáo trong tuần
curl ... -d '{"resource":"reports","filters":{"report_type":"daily","from":"2026-08-10","to":"2026-08-14"}}'

# Hiệu suất theo Team và thời gian
curl ... -d '{"resource":"performance","filters":{"from":"2026-08-01","to":"2026-08-14","team":"<team-uuid>"}}'

# Thành viên theo Team
curl ... -d '{"resource":"members","filters":{"team":"<team-uuid>","active":true}}'
```

## 4. Ví dụ response

```json
{
  "resource": "tasks",
  "data": [
    {
      "id": "…",
      "name": "Chuẩn bị báo cáo tuần",
      "status": "in_progress",
      "priority": "high",
      "work_weight": 2,
      "deadline": "2026-08-12T10:00:00+00:00",
      "assignee_id": "…",
      "project_id": "…",
      "team_id": "…"
    }
  ],
  "meta": { "count": 128, "limit": 100, "offset": 0, "has_more": true }
}
```

Lỗi:

```json
{
  "error": {
    "code": "INVALID_FILTER",
    "message": "Filter không hỗ trợ: foo.",
    "allowed_filters": ["status", "project", "assignee", "member", "team", "priority", "overdue", "from", "to", "search"]
  }
}
```

## 5. GPT Actions

- Import schema: `docs/cen-ai-read-openapi.yaml` (sửa `servers.url` thành domain production CEN).
- Authentication: API Key → Bearer → dán `CEN_AI_READ_KEY`.
- URL Action: `https://<domain-production-CEN>/api/ai/read`.

## 6. Duyệt Báo cáo ngày từ n8n

Endpoint ghi dùng chung `CEN_AI_READ_KEY` và danh tính `CEN_AI_VIEWER_USER_ID` với endpoint đọc:

```
POST https://<domain-production-CEN>/api/ai/act
Authorization: Bearer $CEN_AI_READ_KEY
Content-Type: application/json
```

Chỉ có action `daily_report_review`. `decision` chỉ nhận `approved` hoặc
`changes_requested`; `note` bắt buộc có nội dung cho cả hai quyết định.

```bash
curl -s -X POST https://<domain>/api/ai/act \
  -H "Authorization: Bearer $CEN_AI_READ_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"daily_report_review","report_id":"<report-uuid>",
       "decision":"approved","note":"Đã kiểm tra kết quả và kế hoạch."}'
```

Response thành công:

```json
{
  "action": "daily_report_review",
  "data": {
    "report_id": "…",
    "status": "approved",
    "review_note": "Đã kiểm tra kết quả và kế hoạch.",
    "reviewer_id": "…",
    "reviewed_at": "2026-08-14 09:30:00+00"
  }
}
```

Thao tác chạy dưới quyền của `CEN_AI_VIEWER_USER_ID`. RLS và trigger hiện có sẽ
từ chối nếu user này không được duyệt báo cáo hoặc báo cáo không còn ở trạng thái
`submitted`; client nhận JSON chứa `code` và `message` tương ứng. Mỗi lần gọi được
ghi vào `audit_logs` với action `ai.act`, nhưng nội dung `note` không được đưa vào
metadata audit.
