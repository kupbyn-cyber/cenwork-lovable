
-- Người duyệt Báo cáo ngày: Member -> Leader Team chính; Leader -> CMO; Admin dự phòng.
CREATE OR REPLACE FUNCTION public.report_daily_reviewer(_author uuid, _team uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _r uuid; _team_id uuid;
BEGIN
  IF _author IS NULL THEN RETURN NULL; END IF;

  IF NOT public.has_role(_author, 'leader') THEN
    _team_id := COALESCE(_team, (SELECT primary_team_id FROM public.profiles WHERE id = _author));
    SELECT t.leader_id INTO _r
      FROM public.teams t
      JOIN public.profiles p ON p.id = t.leader_id
     WHERE t.id = _team_id AND t.leader_id <> _author
       AND p.status = 'active' AND p.locked_at IS NULL
     LIMIT 1;
    IF _r IS NOT NULL THEN RETURN _r; END IF;
  END IF;

  SELECT p.id INTO _r FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE ur.role = 'cmo' AND p.id <> _author AND p.status = 'active' AND p.locked_at IS NULL
   ORDER BY p.display_name LIMIT 1;
  IF _r IS NOT NULL THEN RETURN _r; END IF;

  SELECT p.id INTO _r FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE ur.role = 'admin' AND p.id <> _author AND p.status = 'active' AND p.locked_at IS NULL
   ORDER BY p.display_name LIMIT 1;
  RETURN _r;
END; $$;

-- Người duyệt Báo cáo tuần: CMO, Admin dự phòng.
CREATE OR REPLACE FUNCTION public.report_weekly_reviewer(_leader uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _r uuid;
BEGIN
  SELECT p.id INTO _r FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE ur.role = 'cmo' AND p.id IS DISTINCT FROM _leader AND p.status = 'active' AND p.locked_at IS NULL
   ORDER BY p.display_name LIMIT 1;
  IF _r IS NOT NULL THEN RETURN _r; END IF;
  SELECT p.id INTO _r FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE ur.role = 'admin' AND p.id IS DISTINCT FROM _leader AND p.status = 'active' AND p.locked_at IS NULL
   ORDER BY p.display_name LIMIT 1;
  RETURN _r;
END; $$;

GRANT EXECUTE ON FUNCTION public.report_daily_reviewer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_weekly_reviewer(uuid) TO authenticated;

-- Danh bạ tối thiểu để giao diện Báo cáo xác định người duyệt.
CREATE OR REPLACE FUNCTION public.report_reviewer_directory()
RETURNS TABLE(id uuid, display_name text, role app_role, status account_status, primary_team_id uuid, leader_of_team uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, r.role, p.status, p.primary_team_id,
         (SELECT t.id FROM public.teams t WHERE t.leader_id = p.id LIMIT 1)
    FROM public.profiles p
    LEFT JOIN public.user_roles r ON r.user_id = p.id
   WHERE auth.uid() IS NOT NULL AND p.status = 'active' AND p.locked_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.report_reviewer_directory() TO authenticated;

-- Gán người duyệt ngay khi tạo báo cáo ngày, không xoá trắng nữa.
CREATE OR REPLACE FUNCTION public.validate_daily_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_author boolean;
  _is_reviewer boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.author_id <> auth.uid() THEN
      RAISE EXCEPTION 'Chỉ được tạo báo cáo cho chính mình';
    END IF;
    IF NEW.status NOT IN ('draft','submitted') THEN
      RAISE EXCEPTION 'Báo cáo mới chỉ ở trạng thái Bản nháp hoặc Đã gửi';
    END IF;
    IF NEW.report_date > ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) THEN
      RAISE EXCEPTION 'Không được báo cáo cho ngày trong tương lai';
    END IF;
    IF NEW.status = 'submitted' THEN
      IF COALESCE(btrim(NEW.results),'') = '' OR COALESCE(btrim(NEW.next_plan),'') = '' THEN
        RAISE EXCEPTION 'Phải nhập kết quả đạt được và kế hoạch ngày mai trước khi gửi';
      END IF;
      NEW.submitted_at := now();
    END IF;
    NEW.reviewer_id := public.report_daily_reviewer(NEW.author_id, NEW.team_id);
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.author_id <> OLD.author_id OR NEW.report_date <> OLD.report_date THEN
    RAISE EXCEPTION 'Không được đổi định danh, người gửi hoặc ngày báo cáo';
  END IF;

  _is_author := auth.uid() = OLD.author_id;
  _is_reviewer := public.can_review_daily_report(OLD.author_id);

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','changes_requested') THEN
    IF NOT _is_reviewer THEN
      RAISE EXCEPTION 'Bạn không có quyền duyệt báo cáo này';
    END IF;
    IF OLD.status <> 'submitted' THEN
      RAISE EXCEPTION 'Chỉ xử lý được báo cáo đang ở trạng thái Đã gửi';
    END IF;
    IF NEW.status = 'changes_requested' AND COALESCE(btrim(NEW.review_note),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập nhận xét khi yêu cầu chỉnh sửa';
    END IF;
    NEW.reviewer_id := auth.uid();
    NEW.reviewed_at := now();
    RETURN NEW;
  END IF;

  IF NOT _is_author THEN
    RAISE EXCEPTION 'Chỉ người gửi được chỉnh sửa nội dung báo cáo';
  END IF;
  IF OLD.status NOT IN ('draft','changes_requested') THEN
    RAISE EXCEPTION 'Báo cáo đã gửi hoặc đã duyệt, không thể chỉnh sửa';
  END IF;
  IF NEW.status NOT IN ('draft','submitted') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ';
  END IF;
  IF NEW.status = 'submitted' THEN
    IF COALESCE(btrim(NEW.results),'') = '' OR COALESCE(btrim(NEW.next_plan),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập kết quả đạt được và kế hoạch ngày mai trước khi gửi';
    END IF;
    NEW.submitted_at := now();
  END IF;
  NEW.reviewer_id := COALESCE(OLD.reviewer_id, public.report_daily_reviewer(NEW.author_id, NEW.team_id));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_weekly_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_author boolean;
  _is_reviewer boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.leader_id <> auth.uid() THEN
      RAISE EXCEPTION 'Chỉ Leader gửi báo cáo tuần cho Team mình';
    END IF;
    IF NEW.team_id IS DISTINCT FROM public.leader_team_id(auth.uid())
       AND NOT public.has_role(auth.uid(),'admin') THEN
      RAISE EXCEPTION 'Bạn không phải Leader của Team này';
    END IF;
    IF NEW.status NOT IN ('draft','submitted') THEN
      RAISE EXCEPTION 'Báo cáo mới chỉ ở trạng thái Bản nháp hoặc Đã gửi';
    END IF;
    IF EXTRACT(ISODOW FROM NEW.week_start) <> 1 THEN
      RAISE EXCEPTION 'Tuần báo cáo phải bắt đầu từ thứ Hai';
    END IF;
    IF NEW.status = 'submitted' THEN
      IF COALESCE(btrim(NEW.highlights),'') = '' OR COALESCE(btrim(NEW.next_week_plan),'') = '' THEN
        RAISE EXCEPTION 'Phải nhập kết quả nổi bật và kế hoạch tuần tới trước khi gửi';
      END IF;
      NEW.submitted_at := now();
    END IF;
    NEW.reviewer_id := public.report_weekly_reviewer(NEW.leader_id);
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.team_id <> OLD.team_id OR NEW.week_start <> OLD.week_start
     OR NEW.leader_id <> OLD.leader_id THEN
    RAISE EXCEPTION 'Không được đổi định danh, Team, tuần hoặc người gửi';
  END IF;

  _is_author := auth.uid() = OLD.leader_id;
  _is_reviewer := public.can_review_weekly_report() AND auth.uid() <> OLD.leader_id;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','changes_requested') THEN
    IF NOT _is_reviewer THEN
      RAISE EXCEPTION 'Chỉ CMO hoặc Admin (không phải người gửi) được duyệt báo cáo tuần';
    END IF;
    IF OLD.status <> 'submitted' THEN
      RAISE EXCEPTION 'Chỉ xử lý được báo cáo đang ở trạng thái Đã gửi';
    END IF;
    IF NEW.status = 'changes_requested' AND COALESCE(btrim(NEW.review_note),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập nhận xét khi yêu cầu chỉnh sửa';
    END IF;
    NEW.reviewer_id := auth.uid();
    NEW.reviewed_at := now();
    RETURN NEW;
  END IF;

  IF NOT _is_author THEN
    RAISE EXCEPTION 'Chỉ Leader gửi báo cáo được chỉnh sửa nội dung';
  END IF;
  IF OLD.status NOT IN ('draft','changes_requested') THEN
    RAISE EXCEPTION 'Báo cáo đã gửi hoặc đã duyệt, không thể chỉnh sửa';
  END IF;
  IF NEW.status NOT IN ('draft','submitted') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ';
  END IF;
  IF NEW.status = 'submitted' THEN
    IF COALESCE(btrim(NEW.highlights),'') = '' OR COALESCE(btrim(NEW.next_week_plan),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập kết quả nổi bật và kế hoạch tuần tới trước khi gửi';
    END IF;
    NEW.submitted_at := now();
  END IF;
  NEW.reviewer_id := COALESCE(OLD.reviewer_id, public.report_weekly_reviewer(NEW.leader_id));
  RETURN NEW;
END; $$;

-- Bổ sung người duyệt cho báo cáo đang chờ mà chưa có người duyệt.
UPDATE public.daily_reports d
   SET reviewer_id = public.report_daily_reviewer(d.author_id, d.team_id)
 WHERE d.reviewer_id IS NULL AND d.status IN ('draft','submitted','changes_requested');

UPDATE public.weekly_reports w
   SET reviewer_id = public.report_weekly_reviewer(w.leader_id)
 WHERE w.reviewer_id IS NULL AND w.status IN ('draft','submitted','changes_requested');
