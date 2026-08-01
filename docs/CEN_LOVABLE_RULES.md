# CEN LOVABLE IMPLEMENTATION RULES

## 1. Thứ tự ưu tiên

Khi triển khai, ưu tiên theo thứ tự:

1. Yêu cầu mới nhất được xác nhận trong prompt hiện tại.

2. Business Rule và dữ liệu đang hoạt động trong code hiện tại.

3. Quy tắc trong tài liệu này.

4. Giải pháp kỹ thuật đơn giản nhất.

Nếu có mâu thuẫn hoặc chưa đủ dữ liệu, phải báo cáo trước; không tự quyết định Business Rule.

## 2. Trước khi thay đổi

Bắt buộc:

- Kiểm tra component, query, schema, permission, RLS và action hiện tại liên quan trực tiếp.

- Xác định đúng file/component đang được Preview sử dụng.

- Tái sử dụng code, component và schema đang có.

- Nêu kế hoạch ngắn trước khi sửa.

- Không tạo chức năng trùng với chức năng đã tồn tại.

## 3. Phạm vi sửa

- Chỉ sửa đúng mục tiêu của gói hiện tại.

- Ưu tiên thay đổi nhỏ nhất.

- Giữ nguyên mọi phần đang hoạt động tốt.

- Không tự thêm tính năng.

- Không mở rộng phạm vi.

- Không sửa module không liên quan.

- Không refactor lớn nếu không bắt buộc.

- Mỗi gói chỉ nên có một kết quả chính và có thể kiểm tra độc lập.

## 4. Business Rule

- Không tự tạo hoặc thay đổi trạng thái nghiệp vụ.

- Không tự thay đổi workflow.

- Không tự thay đổi quyền của vai trò.

- Không đổi Business Rule để phù hợp với code đang làm sai.

- Không tự thêm trường, bước duyệt, loại dữ liệu hoặc hành động ngoài yêu cầu.

- Các ngoại lệ và điều kiện phải được kiểm tra tại server, không chỉ tại UI.

## 5. Phân quyền

Mọi hành động phải kiểm tra phù hợp tại:

- UI.

- Server action/API/Edge Function.

- Database/RLS hoặc database function.

Không coi việc ẩn nút là đã hoàn thành phân quyền.

Phải phân biệt:

- Quyền theo vai trò.

- Quyền theo Team.

- Quyền theo Dự án.

- Quyền theo người tham gia.

- Quyền theo người phụ trách.

- Quyền quản trị đặc biệt.

## 6. Dữ liệu

- Không hard delete dữ liệu nghiệp vụ nếu prompt không yêu cầu rõ.

- Không dùng dữ liệu giả hoặc hardcode thay dữ liệu thật.

- Không sao chép dữ liệu để tạo nguồn dữ liệu thứ hai.

- Không thay đổi schema dùng chung nếu chưa đánh giá ảnh hưởng.

- Migration phải an toàn với dữ liệu hiện có.

- Không tự cập nhật hàng loạt dữ liệu cũ.

- Các action quan trọng phải có validation và chống thao tác lặp.

- Lịch sử, Audit Log và snapshot nghiệp vụ phải được bảo toàn.

## 7. UI và responsive

Giữ nguyên phong cách:

Modern Command Center — Forest Command.

Không tự thay đổi:

- Màu sắc.

- Typography.

- Layout dùng chung.

- Design tokens.

- Component nền.

Mọi giao diện phải có khi phù hợp:

- Loading state.

- Empty state.

- Error state.

- Success feedback.

- Validation.

- Chống bấm lặp.

- Responsive desktop và mobile.

Không làm lại toàn bộ màn hình khi chỉ cần sửa cục bộ.

## 8. Kiểm tra sau khi sửa

Bắt buộc:

- Chạy typecheck/build hiện có.

- Kiểm tra trực tiếp trên Preview.

- Kiểm tra đúng vai trò và phạm vi dữ liệu.

- Kiểm tra desktop và mobile.

- Kiểm tra không ảnh hưởng chức năng cũ.

- Không báo hoàn thành chỉ vì code đã được viết.

- Nếu chưa kiểm tra được end-to-end, phải nói rõ phần chưa kiểm tra.

## 9. Báo cáo kết quả

Sau mỗi gói phải báo cáo ngắn:

1. Nguyên nhân hoặc hiện trạng trước khi sửa.

2. Giải pháp đã thực hiện.

3. File/component/query/schema đã thay đổi.

4. Business Rule và quyền đã áp dụng.

5. Migration nếu có.

6. Kết quả typecheck/build.

7. Kết quả kiểm tra Preview.

8. Nội dung chưa thể xác nhận nếu có.

## 10. Quy tắc áp dụng

- Mọi prompt triển khai tiếp theo phải đọc và tuân thủ file này.

- Prompt cụ thể mới nhất được phép bổ sung hoặc ghi đè một quy tắc trong file, nhưng chỉ trong đúng phạm vi được nói rõ.

- Không được tự suy diễn rằng prompt mới đã thay đổi các Business Rule khác.
