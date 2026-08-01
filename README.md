# Forest Command Theme

M1.1A — THEME FOUNDATION VÀ DESIGN TOKEN CEN

1. Mục tiêu

Thiết lập nền giao diện chính thức cho CEN 1.0 theo phong cách:

Modern Command Center — Forest Command

Lượt này chỉ tập trung tạo theme foundation và design token dùng chung để các gói sau tái sử dụng ổn định.

Kết quả chính cần đạt:

Có hệ design token tập trung.

Chỉ có Dark Mode.

Palette, typography, spacing, radius, border và shadow được chuẩn hóa.

Có một trang preview nội bộ để kiểm tra trực quan theme.

2. Bối cảnh hiện tại

CEN là hệ điều hành vận hành doanh nghiệp, cần giao diện:

tối,

gọn,

chắc,

sắc,

công nghệ,

kỷ luật,

thông minh,

dùng được hằng ngày.

Ảnh minh họa và mô tả giao diện đi kèm là reference chính thức về định hướng hình ảnh cho gói này.

Hãy dùng chúng để hiểu:

tone tổng thể,

phân tầng nền,

cảm giác dark enterprise,

cách nhấn màu,

mật độ và độ rõ ràng của giao diện.

Tuy nhiên, lượt này không phải triển khai full dashboard và không phải triển khai App Shell hoàn chỉnh.

3. Trước khi thay đổi

Trước khi code, hãy:

Kiểm tra code hiện tại.

Kiểm tra cấu hình theme, token, CSS variables, Tailwind config hoặc hệ styling đang dùng.

Kiểm tra asset thương hiệu, logo và font hiện có.

Giữ lại phần nào đã đúng, chỉ chuẩn hóa phần cần thiết.

Nêu kế hoạch ngắn trước khi triển khai.

Chỉ sửa đúng phạm vi M1.1A.

Không refactor lớn.
Không thay framework hoặc thư viện nếu không thật sự cần.

4. Phạm vi cần làm

4.1. Thiết lập Design Token tập trung

Tạo hoặc chuẩn hóa một nguồn token dùng chung cho toàn bộ giao diện.

Bao gồm tối thiểu:

Color tokens

background base

background elevated

surface

surface subtle

border default

border strong

text primary

text secondary

text muted

text disabled

brand primary

brand secondary

accent yellow

accent orange

success

warning

error / destructive

info

focus ring

overlay backdrop

Typography tokens

font family

font size scale

font weight

line height

heading

body

label

caption

helper text

KPI number style

Layout / shape tokens

spacing scale

border width

radius

shadow

z-index nền

control height cơ bản

icon size cơ bản

Tất cả phải được đặt tên theo ý nghĩa sử dụng, không đặt tên tùy tiện theo màu đơn thuần nếu không cần.

4.2. Dark theme duy nhất

Thiết lập Dark Mode là mặc định và duy nhất.

Không được:

thêm Light Mode,

thêm Theme Switcher,

đổi theme theo hệ điều hành,

giữ song song 2 theme nếu không bắt buộc kỹ thuật.

Theme phải tạo cảm giác:

nền đen than,

có ánh xanh rất nhẹ,

hiện đại nhưng không nặng nề,

rõ cấu trúc,

không neon,

không gaming,

không cyberpunk,

không Web3 style.

4.3. Quy tắc màu chính thức

Dựa trên logo và mô tả giao diện, dùng các màu định hướng sau làm nền cho token:

xanh đậm CEN: #194D3A

xanh lá CEN: #2F7252

vàng nhấn: #F6C833

cam nhấn: #E67E22

Yêu cầu sử dụng:

Màu thương hiệu

Xanh CEN là màu thương hiệu chính, dùng có chủ đích cho:

trạng thái đang chọn của menu,

action chính,

tab đang active,

focus state,

checkbox / selected control,

điểm nhấn chính của hệ thống.

Không dùng xanh phủ dày toàn bộ màn hình.

Màu nhấn

Vàng và cam chỉ dùng tiết chế cho:

cảnh báo,

deadline cần chú ý,

điểm thông tin cần nhấn vừa phải.

Không dùng vàng và cam làm màu nền chủ đạo diện rộng.

Tách biệt màu thương hiệu và màu trạng thái

Màu trạng thái nghiệp vụ phải được tách riêng khỏi màu nhận diện thương hiệu:

đỏ: quá hạn / nguy hiểm / destructive / ưu tiên cao

cam hoặc vàng: cảnh báo / sắp đến hạn

xanh lam hoặc teal: đang thực hiện

xanh success riêng: hoàn thành

xám: chờ xử lý / chưa bắt đầu / disabled / neutral

Màu trạng thái không dùng để trang trí.

4.4. Quy tắc hình khối và chiều sâu

Áp dụng đúng tinh thần enterprise, gần phẳng, chắc và tiết chế.

Radius

Chuẩn hóa theo định hướng:

container lớn: khoảng 12px

card: khoảng 10px

button và input: khoảng 8px

badge: khoảng 6px

Không bo tròn kiểu pill cho mọi thứ.

Border

dùng border mảnh,

rõ cấu trúc,

ưu tiên tách lớp bằng border + độ sáng,

không phụ thuộc vào glow.

Shadow

shadow mềm và nhẹ,

blur rất nhẹ hoặc không blur quá nhiều,

không dùng hiệu ứng phát sáng mạnh.

4.5. Typography

Dùng sans-serif hiện đại, rõ ràng, dễ đọc.

Ưu tiên:

font chính thức đang có trong project nếu đã đúng,

nếu chưa có hoặc chưa rõ, ưu tiên Inter,

có thể dùng Plus Jakarta Sans nếu project đã dùng sẵn và phù hợp.

Quy tắc:

heading: weight 600

body: weight 400–500

KPI number: 600–700

text phải dễ quét, phù hợp mật độ quản trị

không mang cảm giác landing page marketing

4.6. Motion foundation

Chỉ chuẩn hóa nguyên tắc motion ở mức nền:

hover,

focus,

tab change,

drawer open,

button feedback,

row select.

Yêu cầu:

nhanh,

nhẹ,

có mục đích.

Không dùng:

glow liên tục,

animated gradient,

background animation,

zoom mạnh,

motion phô trương.

4.7. Tạo một trang preview nội bộ

Tạo một route nội bộ tối giản để kiểm tra theme foundation.

Trang này chỉ cần hiển thị:

palette màu chính

màu trạng thái

text color hierarchy

typography scale

spacing scale

radius scale

border samples

shadow samples

2–3 surface / card layer minh họa

một vài block UI trung tính rất cơ bản để kiểm tra cảm giác tổng thể

Trang preview này là theme preview / style board, không phải dashboard thật.

Không được:

biến thành App Shell hoàn chỉnh,

làm sidebar thật,

làm topbar thật,

làm dashboard nghiệp vụ thật,

tạo dữ liệu User / Team / Project giả.

Nếu cần route riêng, hãy tạo route nội bộ đơn giản, dễ truy cập để kiểm tra Preview nhưng không đặt thành navigation nghiệp vụ chính.

5. Hành vi mong muốn

Toàn bộ phần vừa triển khai phải dùng chung token.

Dark theme phải áp dụng rõ trên body và surface.

Các layer nền phải phân biệt bằng độ sáng, border mảnh và shadow nhẹ.

Giao diện phải tạo cảm giác đáng tin cậy, ổn định, có tính vận hành hằng ngày.

Phần preview phải đủ để kiểm tra visual direction trước khi sang các component ở prompt tiếp theo.

6. Business Rule

BR-M1.1A-01 — Một nguồn token duy nhất

Mọi giá trị màu, text, spacing, radius, border và shadow trong phần triển khai phải đi qua hệ token dùng chung.

BR-M1.1A-02 — Dark Mode duy nhất

Chỉ sử dụng Dark Mode. Không có Light Mode, không có theme switcher.

BR-M1.1A-03 — Tách màu thương hiệu và màu trạng thái

Màu brand chỉ dùng cho nhận diện và action chính. Màu trạng thái dùng cho trạng thái nghiệp vụ. Không trộn lẫn vai trò.

BR-M1.1A-04 — Theme phải bám Forest Command

Visual tone phải tối, gọn, chắc, sắc, công nghệ; không gaming, không neon, không cyberpunk.

BR-M1.1A-05 — Preview chỉ để kiểm tra theme

Trang preview không được bị biến thành module nghiệp vụ hoặc dashboard thật.

7. Dữ liệu liên quan

Gói này không dùng dữ liệu nghiệp vụ thật.

Chỉ dùng nội dung trung tính để hiển thị preview, ví dụ:

tên nhóm màu,

tên kiểu chữ,

spacing mẫu,

surface sample,

text sample.

Không tạo dữ liệu giả như:

danh sách nhân sự,

dự án,

team,

công việc,

KPI thật.

8. Phân quyền

Không triển khai phân quyền trong gói này.

Không tạo:

role,

permission,

auth state,

session,

user data.

9. UI và responsive

Desktop

Preview phải hiển thị rõ ràng, có phân nhóm logic, dễ rà soát.

Tablet

Các nhóm preview có thể xuống dòng hoặc chia cột lại hợp lý.

Mobile

Các section xếp dọc, không tràn, không vỡ layout, không có cuộn ngang toàn trang.

Yêu cầu chung:

không tràn text,

không tràn card,

không có horizontal scroll toàn trang,

nội dung tiếng Việt hiển thị ổn.

10. Các trạng thái giao diện

Trong gói này chưa cần xây toàn bộ state component, nhưng preview cần đủ để kiểm tra tối thiểu:

default theme appearance

text hierarchy

border hierarchy

surface hierarchy

focus color token

state color token

Không cần triển khai Button loading, Form error, Table empty ở lượt này.

11. Những phần phải giữ nguyên

Giữ nguyên:

cấu hình project,

kết nối GitHub,

logo CEN,

asset thương hiệu,

font chính thức nếu đã cấu hình đúng,

routing hiện có không liên quan,

module hiện có đang chạy tốt.

12. Những việc không được làm

Không làm App Shell hoàn chỉnh.

Không làm sidebar thật.

Không làm topbar thật.

Không làm navigation nghiệp vụ.

Không làm dashboard thật.

Không làm authentication.

Không làm session.

Không làm user.

Không làm team.

Không làm cơ sở.

Không làm department.

Không làm role / permission.

Không làm project / task / report / settings.

Không làm button system đầy đủ.

Không làm form system đầy đủ.

Không làm table / modal / drawer / toast ở lượt này.

Không thêm Light Mode.

Không thêm Theme Switcher.

Không đổi logo.

Không đổi nhận diện thương hiệu.

Không dùng xanh tím làm màu chủ đạo.

Không làm giao diện gaming, neon, cyberpunk, Web3.

Không refactor lớn.

Không sửa module không liên quan.

Không cài thêm thư viện nếu chưa thực sự cần.

Không tự thêm tính năng ngoài phạm vi.

13. Cách kiểm tra

Kiểm tra tối thiểu:

Có nguồn token tập trung.

Có token màu, text, spacing, radius, border, shadow.

Dark theme được áp dụng mặc định.

Không có Light Mode.

Không có Theme Switcher.

Màu brand bám palette CEN.

Không xuất hiện xanh tím sai nhận diện.

Có tách biệt màu brand và màu trạng thái.

Radius bám đúng tinh thần: container lớn ~12, card ~10, button/input ~8, badge ~6.

Typography rõ ràng, dễ đọc.

Nền, surface, border và text có phân cấp rõ.

Shadow nhẹ và tiết chế.

Preview route mở được trực tiếp.

Preview không phải dashboard thật.

Mobile không có cuộn ngang toàn trang.

Tablet và desktop hiển thị ổn.

Không xuất hiện dữ liệu nghiệp vụ giả.

Không ảnh hưởng phần cũ của project.

14. Điều kiện hoàn thành

Gói này hoàn thành khi:

Design token được tập trung.

Dark Mode là mặc định và duy nhất.

Palette bám đúng định hướng CEN.

Có tách biệt màu thương hiệu và màu trạng thái.

Typography, spacing, radius, border và shadow được chuẩn hóa.

Preview nội bộ mở được và đủ kiểm tra theme foundation.

Giao diện đúng tinh thần Forest Command.

Không có Light Mode.

Không có xanh tím sai nhận diện.

Không triển khai vượt scope.

Không ảnh hưởng phần đang hoạt động.

Có báo cáo rõ file hoặc phần đã thay đổi.

15. Báo cáo sau khi làm

Báo cáo rõ:

file đã tạo,

file đã sửa,

nơi lưu design token,

route preview nội bộ,

palette đã dùng,

font đã dùng,

xác nhận không có Light Mode,

xác nhận không triển khai ngoài phạm vi.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cenwork.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/477f480a-a6e5-4152-b50c-f14ca8f15e83).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
