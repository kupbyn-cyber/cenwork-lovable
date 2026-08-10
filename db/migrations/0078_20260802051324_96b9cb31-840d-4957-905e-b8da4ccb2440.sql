CREATE TABLE public.duty_assignment_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.duty_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_assignment_members TO authenticated;
GRANT ALL ON public.duty_assignment_members TO service_role;

ALTER TABLE public.duty_assignment_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY duty_assignment_members_select ON public.duty_assignment_members
  FOR SELECT TO authenticated USING (public.is_active_account(auth.uid()));
CREATE POLICY duty_assignment_members_write ON public.duty_assignment_members
  FOR ALL TO authenticated USING (public.can_manage_duty()) WITH CHECK (public.can_manage_duty());

CREATE INDEX duty_assignment_members_user_idx ON public.duty_assignment_members(user_id);

CREATE OR REPLACE FUNCTION public.duty_is_member(_assignment uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.duty_assignment_members m
     WHERE m.assignment_id = _assignment AND m.user_id = _user
  );
$$;

REVOKE EXECUTE ON FUNCTION public.duty_is_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duty_is_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.duty_set_completed(_assignment uuid, _completed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r public.duty_assignments%ROWTYPE;
BEGIN
  IF NOT public.is_active_account(auth.uid()) THEN
    RAISE EXCEPTION 'Bạn không có quyền thực hiện thao tác này.';
  END IF;
  SELECT * INTO r FROM public.duty_assignments WHERE id = _assignment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lịch trực nhật.'; END IF;
  IF r.assignee_id IS NULL THEN
    RAISE EXCEPTION 'Lịch chỉ giao cho dịch vụ ngoài không cần bấm hoàn thành.';
  END IF;
  IF NOT (public.can_manage_duty()
          OR r.assignee_id = auth.uid()
          OR public.duty_is_member(_assignment, auth.uid())
          OR (NOT _completed AND r.completed_by = auth.uid())) THEN
    RAISE EXCEPTION 'Bạn không có quyền thực hiện thao tác này.';
  END IF;

  IF _completed THEN
    UPDATE public.duty_assignments
       SET status = 'completed', completed_by = auth.uid(), completed_at = now()
     WHERE id = _assignment;
  ELSE
    UPDATE public.duty_assignments
       SET status = CASE
             WHEN (duty_date + due_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' < now() THEN 'overdue'::public.duty_status
             ELSE 'pending'::public.duty_status END,
           completed_by = NULL, completed_at = NULL
     WHERE id = _assignment;
  END IF;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.duty_set_completed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duty_set_completed(uuid, boolean) TO authenticated;