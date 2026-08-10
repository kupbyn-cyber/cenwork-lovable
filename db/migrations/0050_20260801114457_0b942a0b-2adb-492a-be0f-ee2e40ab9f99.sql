-- Nguyên nhân gốc: khi INSERT ... RETURNING, policy SELECT gọi can_view_project(id)/can_view_task(id).
-- Hai hàm này đọc lại chính bảng đang INSERT nên chưa nhìn thấy dòng vừa ghi trong cùng câu lệnh
-- => trả về false => Postgres báo 42501 "new row violates row-level security policy".
-- Admin/CMO không dính lỗi vì has_role() đúng ngay mà không cần đọc lại dòng.
-- Sửa tối thiểu: bổ sung nhánh dùng trực tiếp cột của dòng (đã nằm trong phạm vi cũ của helper),
-- không nới rộng quyền xem.

DROP POLICY IF EXISTS projects_select_scoped ON public.projects;
CREATE POLICY projects_select_scoped ON public.projects
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      created_by = auth.uid()
      OR owner_id = auth.uid()
      OR public.can_view_project(id)
    )
  );

DROP POLICY IF EXISTS tasks_select_scoped ON public.tasks;
CREATE POLICY tasks_select_scoped ON public.tasks
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      created_by = auth.uid()
      OR assignee_id = auth.uid()
      OR public.can_view_task(id)
    )
  );
