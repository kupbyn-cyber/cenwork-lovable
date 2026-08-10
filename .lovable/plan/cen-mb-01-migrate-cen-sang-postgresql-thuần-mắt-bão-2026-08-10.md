# CEN-MB-01 — Migrate CEN sang PostgreSQL thuần (Mắt Bão)

## Kết quả audit hiện trạng

Phụ thuộc Lovable Cloud/Supabase hiện tại:

- **Data access**: 167 lời gọi `supabase.from(...)` / `supabase.rpc(...)` trong 67 file. 29 module trong `src/lib/*` chạy **trong trình duyệt** (component gọi trực tiếp), chỉ 48 chỗ dùng `createServerFn`.
- **Business rule nằm trong database**: 118 migration, ~90 bảng, **95 RPC** khác nhau, **369** khai báo `SECURITY DEFINER`, **243** RLS policy. Phần lớn quy tắc duyệt/phân quyền/thông báo nằm trong SQL function + RLS, không nằm trong TypeScript.
- **Auth**: Supabase Auth (`signInWithPassword`, `getUser`, `updateUser`, `signOut`, `onAuthStateChange`), bearer token gắn qua `functionMiddleware`, bootstrap admin qua Admin API.
- **Storage**: không có lời gọi `supabase.storage` nào (avatar hiện lưu dạng URL/text) → không có blocker storage.
- **Realtime**: không dùng (`.channel` = 0) → chỉ refetch/invalidate.
- **Edge functions**: không có; Telegram đi qua server route + `pg_net`/outbox trong DB.

Kết luận: đây là migration hạ tầng lớn (ước tính vài nghìn dòng đụng chạm), **không thể hoàn tất an toàn trong một lượt**. Kế hoạch dưới đây chia theo giai đoạn, mỗi giai đoạn app vẫn chạy được.

## Phương án kỹ thuật đề xuất

Giữ nguyên UI, route, business rule. Thay hạ tầng theo 3 trụ:

1. **DB layer**: `pg` (node-postgres) Pool đọc `DATABASE_URL`, chỉ chạy server-side (`src/db/*.server.ts`). Migration bằng file SQL đánh số + runner nhỏ (`npm run db:migrate`), idempotent, ghi bảng `_cen_migrations`. Không dùng ORM nặng — schema hiện có là SQL thuần, port trực tiếp rẻ và ít rủi ro nhất.
2. **Giữ lại SQL business logic**: toàn bộ function/trigger hiện có được port sang PostgreSQL thuần (bỏ `auth.uid()` → `current_setting('cen.user_id')`, bỏ role `anon/authenticated/service_role`, bỏ GRANT kiểu PostgREST). Mỗi request server `SET LOCAL cen.user_id` trong transaction → RLS vẫn chạy nguyên vẹn, không phải viết lại 243 policy bằng TypeScript.
3. **Bỏ supabase-js**: thay bằng adapter server-side có cùng bề mặt tối thiểu (`.from().select().eq()...`, `.rpc()`) chạy trên `pg`, để 29 module `src/lib` giữ nguyên logic; mọi module đang chạy ở browser được bọc lại thành `createServerFn` (client chỉ gọi RPC HTTP của CEN, không bao giờ chạm DB).

Auth: bảng `auth_users` (email, `password_hash` bcrypt/argon2 qua `node-rs`/`bcryptjs`), session lưu cookie HttpOnly + Secure + SameSite=Lax, có bảng `sessions` để logout/khóa tài khoản là vô hiệu ngay. Bootstrap admin giữ nguyên `/setup` + `CEN_BOOTSTRAP_TOKEN`, chỉ chạy khi chưa có admin.

## Giai đoạn triển khai

```text
P1  Nền tảng      pg pool + migration runner + npm run db:migrate + fail rõ khi thiếu DATABASE_URL
P2  Schema        port 118 migration -> 1 bộ SQL sạch cho database trắng (bảng, FK, index, trigger, function, RLS theo cen.user_id)
P3  Auth          bảng users/sessions, login/logout/change-password server-side, cookie, khóa tài khoản, bootstrap admin
P4  Adapter       lớp query tương thích + chuyển 29 module src/lib sang server-only, bọc serverFn
P5  Module        rà từng module (Task, Project, Report, Announcement, Approval, MVP, Duty, Document, Recognition, Notification, Org/Permission, Audit, Telegram) chạy thật trên PG
P6  Production    build:node + start, PORT/host từ env, tài liệu ENV, checklist test Mắt Bão
```

## Chi tiết kỹ thuật chính

- `src/db/pool.server.ts`: Pool + `withSession(userId, fn)` mở transaction, `SET LOCAL cen.user_id`, `SET LOCAL ROLE cen_app` (role thường, RLS áp dụng).
- `db/migrations/NNNN_*.sql` + `scripts/migrate.mjs`; `npm run db:migrate`.
- `src/lib/auth/session.server.ts`: tạo/kiểm/hủy session, cookie `cen_session`, hash token trong DB.
- Không có secret nào ở `VITE_*`; frontend chỉ biết route HTTP của CEN.

## ENV production (Mắt Bão)

`DATABASE_URL`, `CEN_SESSION_SECRET`, `CEN_BOOTSTRAP_TOKEN`, `TELEGRAM_BOT_TOKEN`, `NODE_ENV`, `PORT`, `CEN_BASE_URL`.

## Cần bạn xác nhận

1. Đồng ý giữ business logic trong SQL function + RLS (dùng `cen.user_id`) thay vì viết lại toàn bộ sang TypeScript — nhanh hơn, ít rủi ro sai rule hơn.
2. Đồng ý lộ trình nhiều lượt: lượt này làm **P1 + P2 + P3** (nền tảng DB, schema trắng chạy được, auth + bootstrap admin), các lượt sau làm P4–P6.
3. Trong lúc chưa xong P4–P6, môi trường preview vẫn dùng backend hiện tại để app không chết; production Mắt Bão chỉ bật khi P6 xong.
