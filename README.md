# CEN WORK

## Marketing Command Center

CEN WORK là trung tâm điều hành Marketing của hệ thống Tự Do, kết nối con người, Team, dự án, công việc, báo cáo, thông báo và dữ liệu quản trị trên một hệ thống thống nhất.

Ứng dụng là một web app dark-mode, vận hành hằng ngày cho Admin, CMO, Leader và Member: mở CEN Today để biết việc cần xử lý ngay, rồi đi sâu vào từng module nghiệp vụ.

---

## 1. Tổng quan sản phẩm

- **Một nguồn dữ liệu duy nhất** cho tổ chức, nhân sự, dự án, công việc và báo cáo.
- **Vận hành theo vai trò**: nội dung hiển thị và hành động khả dụng thay đổi theo quyền hiệu lực.
- **Ưu tiên hành động**: quá hạn, cần duyệt, cần sửa, cần báo cáo được đẩy lên trước.
- **Giao diện Modern Command Center**: chỉ Dark Mode, tông xanh CEN, tiết chế màu nhấn.

## 2. Các module hiện có

Nguồn: `src/config/navigation.ts`.

**Không gian làm việc**

| Module | Route | Mô tả |
| --- | --- | --- |
| Trang chủ (CEN Today) | `/` | Banner chào + bộ lọc thời gian, KPI theo vai trò, việc cần xử lý, hành động nhanh, widget theo vai trò |
| Dự án | `/projects` | Danh sách và chi tiết dự án |
| Công việc | `/tasks` | Danh sách, bộ lọc nâng cao, saved views, bình luận và duyệt hoàn thành |
| Báo cáo | `/reports` | Báo cáo ngày, báo cáo tuần, nghĩa vụ báo cáo, duyệt và lưu trữ |
| Tài liệu | `/documents` | Danh mục tài liệu, vòng đời và phê duyệt |
| Hiệu suất | `/performance` | Bảng và biểu đồ hiệu suất |
| MVP và danh hiệu | `/mvp` | Chu kỳ MVP, chấm điểm, bình chọn |
| Thông báo & Phê duyệt | `/announcements`, `/approvals` | Thông báo, xác nhận đã đọc, khảo sát, luồng phê duyệt |
| Lịch trực nhật | `/duty` | Phân công và quy tắc trực nhật |
| Ghi nhận đồng đội | `/recognitions` | Ghi nhận, reaction, thống kê team pulse |

**Tổ chức**

| Module | Route | Mô tả |
| --- | --- | --- |
| Thành viên | `/members` | Danh bạ thành viên, tạo/sửa, khóa và lưu trữ tài khoản |
| Cơ cấu tổ chức | `/organization` | Cơ sở, phòng ban, Team |
| Vai trò và quyền | `/roles` | Ma trận quyền theo vai trò, override theo người dùng, lịch sử thay đổi |

**Tài khoản / Hệ thống**

| Module | Route | Mô tả |
| --- | --- | --- |
| Cài đặt | `/settings` | Hồ sơ cá nhân, avatar, cấu hình quản trị |
| Nhật ký hoạt động | `/audit-logs` | Audit log hệ thống |
| Kết nối Telegram | `/telegram` | Cấu hình và gửi thông báo Telegram |
| Design System | `/theme-preview` | Style board kiểm tra token giao diện |

**Ngoài vùng đăng nhập**: `/login`, `/setup` (khởi tạo Admin đầu tiên), `/change-password`.

## 3. Công nghệ

Đối chiếu `package.json` và `vite.config.ts`:

- **TanStack Start v1** (React 19, SSR) + **TanStack Router** file-based routing trong `src/routes`
- **Vite** làm build tool, **Nitro** sinh server output
- **TanStack Query** cho data fetching và cache
- **Tailwind CSS v4** (`src/styles.css`) + **shadcn/ui** trên nền Radix UI, icon **lucide-react**
- **Supabase** (Postgres, Auth, Storage, RLS) qua `@supabase/supabase-js`
- **react-hook-form** + **zod** cho form và validate, **recharts** cho biểu đồ, **sonner** cho toast
- **TypeScript** strict, **ESLint** + **Prettier**

Logic phía server dùng `createServerFn` của TanStack Start (`src/lib/*.functions.ts`, helper `*.server.ts`). Endpoint cho hệ thống ngoài đặt tại `src/routes/api/public/*`.

## 4. Cấu trúc thư mục

```text
src/
  components/      UI theo module (task, report, org, recognition, home, layout, ui...)
  config/          navigation.ts — nguồn duy nhất cho sidebar và mobile drawer
  hooks/           hook dùng chung (auth, org access, today range...)
  integrations/    client Supabase và middleware auth (tự sinh, không sửa tay)
  lib/             data layer, server functions, business helper
  routes/          file-based routing; _authenticated/* là vùng cần đăng nhập
  styles.css       design token và theme dark duy nhất
supabase/          cấu hình project backend
docs/              tài liệu nội bộ (CEN_LOVABLE_RULES.md)
public/            asset tĩnh, logo CEN
```

## 5. Cài đặt và chạy

Yêu cầu: Node.js 20+ (hoặc Bun 1.x).

```sh
git clone <repository-url>
cd <repository-name>
npm i
npm run dev
```

Ứng dụng chạy tại `http://localhost:8080`.

Script có sẵn (`package.json`):

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy dev server |
| `npm run build` | Build production (mặc định target edge) |
| `npm run build:node` | Build với `NITRO_PRESET=node` cho self-host |
| `npm run start` | Chạy server đã build: `node .output/server/index.mjs` |
| `npm run build:dev` | Build ở mode development |
| `npm run preview` | Xem thử bản build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## 6. Biến môi trường

Chỉ các biến thực sự dùng trong project. Biến `VITE_*` là public, được nhúng vào bundle trình duyệt — tuyệt đối không đặt secret ở đây.

| Biến | Dùng ở | Ghi chú |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | client | URL project backend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client | Publishable key (public) |
| `VITE_SUPABASE_PROJECT_ID` | client | Project id |
| `SUPABASE_URL` | server | Dùng trong server function |
| `SUPABASE_PUBLISHABLE_KEY` | server | Publishable key phía server |
| `SUPABASE_PROJECT_ID` | server | Project id |
| `NITRO_PRESET` | build | Đặt `node` khi self-host |

Secret phía server (ví dụ `CEN_BOOTSTRAP_TOKEN` dùng cho trang `/setup`) được quản lý ở phần cấu hình secret của backend, không commit vào repo.

## 7. Khởi tạo hệ thống lần đầu

1. Mở `/setup`.
2. Nhập bootstrap token đã cấu hình cùng email/mật khẩu quản trị (mật khẩu tối thiểu 8 ký tự).
3. Hệ thống tự seed cấu hình mặc định (danh mục quyền, cấu hình quyền theo vai trò, `app_settings`) và tạo tài khoản Admin đầu tiên.
4. Sau khi có Admin, trang `/setup` bị khóa; các tài khoản tiếp theo tạo trong module **Thành viên**.

## 8. Nguyên tắc bảo mật

- Mọi bảng nghiệp vụ bật **RLS**; quyền đọc/ghi kiểm soát bằng policy phía database, không tin phía client.
- **Vai trò lưu ở bảng riêng** (`user_roles`), mỗi người dùng đúng một system role; không lưu role trên profile.
- Kiểm tra quyền qua hàm security definer; frontend chỉ ẩn/hiện UI, backend luôn kiểm tra lại.
- Không commit secret, service role key hay mật khẩu database vào repo.
- Tài khoản nghỉ việc được **khóa và lưu trữ**, không xóa cứng; danh tính bị che với người dùng thường.
- Hành động quản trị được ghi vào **nhật ký hoạt động**.

## 9. Triển khai

- **Trên Lovable**: publish trực tiếp từ editor, backend đi kèm.
- **Self-host bằng Docker**: `Dockerfile` build bằng Bun, sinh Nitro Node server và chạy `node .output/server/index.mjs` ở cổng `3000`.

```sh
docker build -t cen-work \
  --build-arg VITE_SUPABASE_URL=... \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
  --build-arg VITE_SUPABASE_PROJECT_ID=... .
docker run -p 3000:3000 --env-file .env.runtime cen-work
```

Chỉ truyền biến public qua `--build-arg`; secret truyền lúc chạy.

## 10. Quy ước phát triển

- Đọc `docs/CEN_LOVABLE_RULES.md` trước khi triển khai một gói thay đổi.
- Chỉ Dark Mode; mọi màu, spacing, radius và shadow đi qua design token trong `src/styles.css`.
- Route mới tạo trong `src/routes`; không sửa tay `src/routeTree.gen.ts`.
- Không sửa file tự sinh trong `src/integrations/supabase/`.
- Thêm module mới phải khai báo trong `src/config/navigation.ts` kèm `permissionKey` tương ứng.

---

Dự án được xây dựng với [Lovable](https://lovable.dev) · **Live app**: https://cenwork.lovable.app
