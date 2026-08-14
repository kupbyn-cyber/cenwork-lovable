-- CEN-AI-READ-01.1 — Khôi phục quyền thực thi hàm kiểm tra hiển thị báo cáo.
-- Migration 0060 REVOKE ... FROM public đã xóa luôn quyền mặc định của
-- authenticated/cen_app, khiến policy reports_select báo
-- "permission denied for function report_doc_visible".
-- Chỉ cấp EXECUTE cho đúng role ứng dụng; logic visibility giữ nguyên.
GRANT EXECUTE ON FUNCTION public.report_doc_visible(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_section_visible(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_doc_editable(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.team_summary_visible(uuid) TO authenticated, service_role;
