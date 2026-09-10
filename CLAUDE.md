# CLAUDE.md — CEN WORK

Hướng dẫn làm việc cho Claude Code trên repo này. Đọc file này trước mọi thay đổi.

## 0. Production architecture — ĐÃ CHỐT (binding)

- **Runtime production**: Mắt Bão. **Database production**: PostgreSQL 16 trên Mắt Bão.
- Production **không còn dùng** Supabase / Lovable Cloud dưới bất kỳ hình thức nào.
- Các file Supabase còn lại trong repo (`src/integrations/supabase/*`, nhánh legacy trong
  `cen-auth-middleware.ts`, `supabase-context.server.ts`, ...) chỉ là
  **legacy/compatibility** (dùng khi chạy preview không có `DATABASE_URL`) —
  **không được coi là production path, không được ưu tiên, không được dùng để suy luận
  hành vi production.**
- **Khi code có cả nhánh PostgreSQL và nhánh Supabase/legacy**: production behavior luôn
  được xác định theo **nhánh PostgreSQL** (`DATABASE_URL` có giá trị). Không sửa nhánh
  legacy nếu package hiện tại không yêu cầu rõ.
- **Production verification**: Claude Code chỉ làm inspect/typecheck/test/build ở local.
  Sau khi commit/push GitHub, người dùng tự Redeploy trên Mắt Bão và test trực tiếp tại
  **https://cenwork.tudogroup.vn**. **Lovable Preview không phải là production
  verification** — không dùng kết quả preview để kết luận production PASS/FAIL.
- **Database**: Claude Code không truy cập hay chỉnh sửa production DB trực tiếp. Mọi
  thay đổi DB chỉ qua migration an toàn trong repo (`db/migrations/`) khi thực sự cần,
  chạy trên production qua quy trình deploy Mắt Bão hiện có — không tự chạy migration
  lên production.

## 1. CEN WORK là gì

Marketing Command Center của hệ thống Tự Do: quản lý Thành viên/Team/Tổ chức, Dự án,
Công việc, Báo cáo, Thông báo & Phê duyệt, Hiệu suất, Lịch trực, Ghi nhận đồng đội,
Phân quyền, Telegram, Web Push. Web app **Dark Mode duy nhất**, phong cách
**Modern Command Center — Forest Command**. Danh sách module nguồn: [src/config/navigation.ts](src/config/navigation.ts).

## 2. Kiến trúc hiện tại

- **Framework**: TanStack Start v1 (React 19, SSR) + TanStack Router (file-based routing
  trong `src/routes`, vùng cần đăng nhập là `src/routes/_authenticated/*`). Vite build,
  Nitro server output. TanStack Query cho data fetching. Tailwind v4 + shadcn/ui (Radix).
- **Repo đang trong quá trình migrate khỏi Supabase/Lovable Cloud sang PostgreSQL thuần
  ("Mắt Bão")** — xem [.lovable/plan/cen-mb-01-migrate-cen-sang-postgresql-thuần-mắt-bão-2026-08-10.md](.lovable/plan/cen-mb-01-migrate-cen-sang-postgresql-thuần-mắt-bão-2026-08-10.md).
  Hiện trạng: đã có pool PostgreSQL trực tiếp, migration runner, auth tự viết, adapter
  giả lập `supabase-js` — coi như đã xong phần lớn (P1–P4); vẫn còn thư mục
  `src/integrations/supabase/*` (client cũ, dùng cho chế độ preview/legacy khi
  không có `DATABASE_URL`) — **không sửa tay** các file tự sinh ở đó.
- **Data layer** (không viết SQL rời rạc tuỳ tiện — tái dùng lớp có sẵn):
  - [src/db/pool.server.ts](src/db/pool.server.ts): `pg.Pool` đọc `DATABASE_URL`.
    `withUser(userId, fn)` chạy transaction với `SET LOCAL ROLE cen_app` +
    `cen.user_id` (RLS áp dụng thật). `withAnon` cho login/bootstrap.
    `withPrivileged` cho tác vụ đặc quyền server đã tự kiểm tra danh tính.
  - [src/lib/db/pg-rest-client.ts](src/lib/db/pg-rest-client.ts) +
    [src/lib/db/server-client.server.ts](src/lib/db/server-client.server.ts): adapter
    cùng bề mặt API `from().select().eq()...`/`.rpc()` như supabase-js, chạy trên
    query plan → SQL thật qua `pg`. Nhờ vậy toàn bộ module nghiệp vụ cũ (`src/lib/*`)
    không phải viết lại.
  - [src/lib/auth/](src/lib/auth/): `pg-auth.server.ts` (login/change-password/bootstrap admin,
    gọi các SQL function sẵn có như `ensure_system_defaults`, `verify_system_defaults`,
    `bootstrap_create_admin` — Business Rule nằm trong DB, không đổi khi đổi hạ tầng),
    `session.server.ts` (cookie HttpOnly), `cen-auth-middleware.ts` (middleware chọn
    giữa session PostgreSQL hoặc bearer token Supabase cũ tuỳ có `DATABASE_URL`).
  - Server logic dùng `createServerFn` của TanStack Start: `src/lib/*.functions.ts`
    (endpoint) + `*.server.ts` (business/DB helper). Endpoint public cho hệ thống
    ngoài: `src/routes/api/public/*`.
- **Business Rule phần lớn nằm trong PostgreSQL**: ~150 file migration
  (`db/migrations/*.sql`, đánh số tuần tự, không sửa migration cũ — luôn tạo file mới),
  `db/repair/*.sql` (script idempotent vá schema cho DB cũ chưa có tracking). Nhiều RPC,
  `SECURITY DEFINER` function, RLS policy quyết định quyền/duyệt/thông báo. Đọc SQL
  trước khi kết luận "bug nằm ở frontend".
- **Migration runner**: `npm run db:migrate` ([scripts/migrate.mjs](scripts/migrate.mjs))
  chạy 3 pha (baseline / migrations / repair), mỗi file trong 1 transaction, ghi vào
  `public._cen_migrations` (theo tên file + checksum) — không chạy trùng, và sẽ FAIL
  cứng nếu nội dung migration cũ bị sửa sau khi đã áp dụng.

## 3. Nguồn / Runtime / Database (production)

- **Code**: GitHub repository hiện tại (nhánh kết nối Lovable — xem [AGENTS.md](AGENTS.md):
  không force-push / rebase / amend / squash commit đã push, vì sẽ làm mất lịch sử phía Lovable).
- **Runtime production**: Mắt Bão, tự host bằng Docker ([Dockerfile](Dockerfile), build
  bằng Bun → Nitro Node server, chạy `node .output/server/index.mjs` cổng 3000).
  Entry point container ([scripts/docker-entrypoint.sh](scripts/docker-entrypoint.sh))
  tự chạy migration trước khi start server.
- **Database production**: PostgreSQL 16 trên Mắt Bão, **đã tách khỏi Lovable Cloud**.
  Biến kết nối: `DATABASE_URL` (+ `DATABASE_SSL`, `DATABASE_POOL_MAX`). Danh sách đầy đủ
  biến môi trường: [.env.example](.env.example) (không có giá trị thật, an toàn để đọc).
- **Không dùng Lovable Preview để xác nhận dữ liệu/hành vi runtime thật** — preview chạy
  hạ tầng Supabase cũ, không phản ánh production Mắt Bão.

### Quy trình làm việc thực tế

Claude Code sửa local source → typecheck/lint/build → commit/push GitHub **khi được yêu
cầu** → redeploy trên Mắt Bão (thao tác của người dùng) → người dùng tự test trực tiếp
trên production/runtime. Claude Code không có quyền truy cập Mắt Bão hay production DB.

## 4. Domain chính

Thành viên/Team/Tổ chức · Dự án · Công việc · Báo cáo · Thông báo & Phê duyệt ·
Hiệu suất · Lịch trực · Ghi nhận đồng đội · Phân quyền · Telegram · Web Push · MVP &
danh hiệu · Tài liệu · Audit Log.

## 5. Nguyên tắc phân quyền

- 4 role: `admin`, `cmo`, `leader`, `member` — nguồn duy nhất:
  [src/lib/permissions.ts](src/lib/permissions.ts) (danh mục permission key) +
  [src/lib/permission-guard.ts](src/lib/permission-guard.ts) (`hasEffectivePermission`,
  `effectiveScope`, `requirePermission` — gọi RPC `has_perm`/`perm_scope`/`perm_role_of`
  trong DB). **Quyền hiệu lực do database quyết định**, không có ma trận hardcode song
  song ở server.
- Vai trò lưu ở bảng riêng (`user_roles`), không lưu trên profile.
- Mọi hành động phải đúng ở cả 3 lớp: UI (ẩn/disable) → server function/API →
  database/RLS hoặc SQL function `SECURITY DEFINER`. **Ẩn nút UI không phải là phân quyền.**
- Khi đổi một chức năng, phải phân biệt và kiểm tra đủ: quyền theo vai trò, theo Team,
  theo Dự án, theo người tham gia/phụ trách, và quyền quản trị đặc biệt (admin/CMO).
- Không tự nới quyền, không tự đổi workflow duyệt, không tự thêm bước/trường/loại dữ
  liệu ngoài yêu cầu.

## 6. Database safety (bắt buộc)

- Production DB là dữ liệu thật. **Tuyệt đối không** tự: DROP/TRUNCATE/reset DB, xóa dữ
  liệu nghiệp vụ, restore production, sửa production bằng SQL thủ công, chạy migration
  trực tiếp lên production, đổi `DATABASE_URL`, in/hiện secret.
- Cần đổi schema → tạo migration mới trong `db/migrations/` (số thứ tự tiếp theo), giữ
  tương thích dữ liệu hiện có, không sửa migration đã tồn tại. Migration chỉ thực sự
  chạy trên production khi qua quy trình deploy Mắt Bão (entrypoint tự chạy
  `db:migrate`) — Claude Code không tự chạy migration lên production.
- Không hard delete dữ liệu nghiệp vụ nếu không được yêu cầu rõ; tài khoản nghỉ việc
  chỉ khóa + lưu trữ. Không dùng dữ liệu giả/hardcode thay dữ liệu thật. Không tự cập
  nhật hàng loạt dữ liệu cũ. Giữ nguyên Audit Log/lịch sử/snapshot nghiệp vụ.
- Không claim "production DB PASS" nếu chưa được xác nhận chạy trên Mắt Bão.

## 7. UI/UX

- Giữ nguyên Design System: Dark Mode duy nhất, token màu/spacing/radius/shadow trong
  [src/styles.css](src/styles.css). Không tự đổi color system, typography, navigation,
  layout chung, hay shared component nếu yêu cầu không nói rõ.
- Route mới đặt trong `src/routes`; **không sửa tay** `src/routeTree.gen.ts` (tự sinh).
  Module mới phải khai báo trong [src/config/navigation.ts](src/config/navigation.ts)
  kèm `permissionKey`.
- Mọi màn hình cần có khi phù hợp: loading/empty/error state, success feedback,
  validation, chống bấm lặp, responsive desktop + mobile.

## 8. Quy trình xử lý mỗi yêu cầu

1. **Inspect** — đọc code/schema/permission/RLS liên quan trực tiếp trước khi sửa.
2. **Report ngắn** trước khi implement: CURRENT LOGIC / ROOT CAUSE / FILES EXPECTED /
   DB CHANGE (yes/no) / RISK. Nếu Business Rule chưa rõ hoặc mâu thuẫn với code/tài liệu
   hiện có → **dừng lại và hỏi**, không tự quyết định.
3. **Implement** — sửa phạm vi nhỏ nhất, tái sử dụng code/schema đang có, giữ nguyên
   phần đang hoạt động tốt. Mỗi package một kết quả chính, kiểm tra độc lập được.
4. **Verify** — ưu tiên chạy `npm run lint`, typecheck, build hiện có; không sửa lỗi
   không liên quan trừ khi nó chặn package.
5. **Report kết quả** theo format: PACKAGE / STATUS / CAUSE / CHANGES / FILES CHANGED /
   DB CHANGE / MIGRATION / TYPECHECK / TEST / BUILD / RUNTIME TEST (bước người dùng cần
   tự làm trên Mắt Bão) / GIT / NEXT STEP.

Thứ tự ưu tiên khi có xung đột: (1) quyết định mới nhất được xác nhận trong prompt hiện
tại → (2) Business Rule đang tồn tại trong code/DB/tài liệu hiện hành → (3) implementation
hiện tại → (4) tài liệu cũ hơn (kể cả file này). Xem thêm chi tiết đầy đủ ở
[docs/CEN_LOVABLE_RULES.md](docs/CEN_LOVABLE_RULES.md).

## 9. Tuyệt đối không tự làm

- Thêm feature ngoài yêu cầu, đổi Business Rule, mở rộng scope, refactor lớn không cần
  thiết, đổi UI/UX chung, đổi permission, đổi cấu trúc database khi không bắt buộc.
- Chạy thao tác phá hủy trên git (force-push, rebase/amend commit đã push) hoặc database
  (xem mục 6).
- Ghi secret/DATABASE_URL/token vào code, commit, hoặc tài liệu.
