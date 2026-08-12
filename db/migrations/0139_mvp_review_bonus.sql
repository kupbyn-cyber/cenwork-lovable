-- MVP-REVIEW-01 — Leader/CMO review 4 tiêu chí (0-5) + bonus đóng góp đặc biệt.

ALTER TABLE public.mvp_manual_reviews
  ADD COLUMN IF NOT EXISTS impact_score numeric NOT NULL DEFAULT 0;

ALTER TABLE public.mvp_manual_reviews
  DROP CONSTRAINT IF EXISTS mvp_manual_reviews_scale_chk;
ALTER TABLE public.mvp_manual_reviews
  ADD CONSTRAINT mvp_manual_reviews_scale_chk CHECK (
    quality_score IN (0,1,2,3,4,5)
    AND proactive_score IN (0,1,2,3,4,5)
    AND impact_score IN (0,1,2,3,4,5)
    AND teamwork_score IN (0,1,2,3,4,5)
  );

ALTER TABLE public.mvp_scorecards
  ADD COLUMN IF NOT EXISTS bonus_score numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.validate_mvp_manual_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _max numeric := GREATEST(NEW.quality_score, NEW.proactive_score, NEW.impact_score, NEW.teamwork_score);
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND (NEW.cycle_id <> OLD.cycle_id OR NEW.subject_id <> OLD.subject_id) THEN
    RAISE EXCEPTION 'Không được đổi kỳ hoặc người được đánh giá';
  END IF;

  IF public.is_mvp_cycle_published(NEW.cycle_id) THEN
    RAISE EXCEPTION 'Kỳ đã công bố, không thể sửa đánh giá trực tiếp';
  END IF;

  IF NEW.reviewer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Chỉ người chấm mới được ghi đánh giá của mình';
  END IF;

  IF NOT public.can_review_mvp(NEW.subject_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền chấm nhân sự này';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' AND NOT public.has_role(auth.uid(),'admin')
     AND NOT public.has_role(auth.uid(),'cmo') THEN
    RAISE EXCEPTION 'Đánh giá đã gửi, không thể chỉnh sửa';
  END IF;

  IF NEW.status = 'submitted' THEN
    IF _max >= 4 AND COALESCE(btrim(NEW.reason),'') = '' THEN
      RAISE EXCEPTION 'Điểm 4 hoặc 5 bắt buộc nhập lý do đánh giá';
    END IF;
    IF COALESCE(btrim(NEW.reason),'') = '' THEN
      RAISE EXCEPTION 'Phải nhập lý do đánh giá';
    END IF;
    IF _max >= 5 AND COALESCE(btrim(NEW.evidence),'') = '' THEN
      RAISE EXCEPTION 'Điểm 5 bắt buộc có ít nhất một bằng chứng';
    END IF;
    NEW.submitted_at := now();
  END IF;

  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.audit_mvp_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.write_audit(
    CASE WHEN NEW.status = 'submitted' THEN 'mvp.review_submitted' ELSE 'mvp.review_saved' END,
    'mvp_review', NEW.id, NULL,
    jsonb_build_object('cycle_id',NEW.cycle_id,'subject_id',NEW.subject_id,
      'quality',NEW.quality_score,'proactive',NEW.proactive_score,
      'impact',NEW.impact_score,'teamwork',NEW.teamwork_score),
    '{}'::jsonb);
  RETURN NEW;
END; $function$;

-- ===== Bonus đóng góp đặc biệt =====
CREATE TABLE IF NOT EXISTS public.mvp_bonus_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.mvp_cycles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points integer NOT NULL CHECK (points IN (1,2,3)),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  evidence text NOT NULL CHECK (btrim(evidence) <> ''),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamp with time zone,
  decision_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mvp_bonus_proposals TO authenticated;
GRANT ALL ON public.mvp_bonus_proposals TO service_role;

ALTER TABLE public.mvp_bonus_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mvp_bonus_select ON public.mvp_bonus_proposals;
CREATE POLICY mvp_bonus_select ON public.mvp_bonus_proposals
FOR SELECT TO authenticated
USING (
  proposer_id = auth.uid()
  OR (subject_id = auth.uid() AND status = 'approved')
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'cmo')
  OR public.can_view_mvp_scorecard(cycle_id, subject_id)
);

DROP POLICY IF EXISTS mvp_bonus_insert ON public.mvp_bonus_proposals;
CREATE POLICY mvp_bonus_insert ON public.mvp_bonus_proposals
FOR INSERT TO authenticated
WITH CHECK (
  proposer_id = auth.uid()
  AND status = 'pending'
  AND public.can_review_mvp(subject_id)
  AND NOT public.is_mvp_cycle_published(cycle_id)
);

DROP POLICY IF EXISTS mvp_bonus_update ON public.mvp_bonus_proposals;
CREATE POLICY mvp_bonus_update ON public.mvp_bonus_proposals
FOR UPDATE TO authenticated
USING (
  NOT public.is_mvp_cycle_published(cycle_id)
  AND (
    (proposer_id = auth.uid() AND status = 'pending')
    OR public.has_role(auth.uid(),'cmo')
  )
)
WITH CHECK (NOT public.is_mvp_cycle_published(cycle_id));

DROP POLICY IF EXISTS mvp_bonus_delete ON public.mvp_bonus_proposals;
CREATE POLICY mvp_bonus_delete ON public.mvp_bonus_proposals
FOR DELETE TO authenticated
USING (
  proposer_id = auth.uid()
  AND status = 'pending'
  AND NOT public.is_mvp_cycle_published(cycle_id)
);

CREATE OR REPLACE FUNCTION public.validate_mvp_bonus_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _approved numeric;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF public.is_mvp_cycle_published(NEW.cycle_id) THEN
    RAISE EXCEPTION 'Kỳ đã công bố, không thể thay đổi đề xuất thưởng';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.proposer_id <> auth.uid() THEN
      RAISE EXCEPTION 'Chỉ người đề xuất mới được tạo đề xuất của mình';
    END IF;
    IF NOT public.can_review_mvp(NEW.subject_id) THEN
      RAISE EXCEPTION 'Bạn không có quyền đề xuất thưởng cho nhân sự này';
    END IF;
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'Đề xuất mới phải ở trạng thái chờ duyệt';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.cycle_id <> OLD.cycle_id OR NEW.subject_id <> OLD.subject_id
       OR NEW.proposer_id <> OLD.proposer_id THEN
      RAISE EXCEPTION 'Không được đổi kỳ, người được đề xuất hoặc người đề xuất';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.has_role(auth.uid(),'cmo') THEN
        RAISE EXCEPTION 'Chỉ CMO được duyệt hoặc từ chối thưởng';
      END IF;
      IF auth.uid() = OLD.proposer_id THEN
        RAISE EXCEPTION 'Người đề xuất không được tự duyệt thưởng';
      END IF;
      NEW.decided_by := auth.uid();
      NEW.decided_at := now();
    ELSIF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Đề xuất đã được xử lý, không thể chỉnh sửa';
    END IF;
  END IF;

  IF NEW.status = 'approved' THEN
    SELECT COALESCE(SUM(points),0) INTO _approved
    FROM public.mvp_bonus_proposals
    WHERE cycle_id = NEW.cycle_id AND subject_id = NEW.subject_id
      AND status = 'approved' AND id <> NEW.id;
    IF _approved + NEW.points > 5 THEN
      RAISE EXCEPTION 'Tổng thưởng đã duyệt trong kỳ không được vượt +5 điểm';
    END IF;
  END IF;

  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_validate_mvp_bonus ON public.mvp_bonus_proposals;
CREATE TRIGGER trg_validate_mvp_bonus
BEFORE INSERT OR UPDATE ON public.mvp_bonus_proposals
FOR EACH ROW EXECUTE FUNCTION public.validate_mvp_bonus_proposal();

DROP TRIGGER IF EXISTS trg_mvp_bonus_updated ON public.mvp_bonus_proposals;
CREATE TRIGGER trg_mvp_bonus_updated
BEFORE UPDATE ON public.mvp_bonus_proposals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.audit_mvp_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.write_audit(
    CASE WHEN TG_OP = 'INSERT' THEN 'mvp.bonus_proposed'
         WHEN NEW.status = 'approved' THEN 'mvp.bonus_approved'
         WHEN NEW.status = 'rejected' THEN 'mvp.bonus_rejected'
         ELSE 'mvp.bonus_updated' END,
    'mvp_bonus', NEW.id, NULL,
    jsonb_build_object('cycle_id',NEW.cycle_id,'subject_id',NEW.subject_id,
      'proposer_id',NEW.proposer_id,'points',NEW.points,'status',NEW.status),
    '{}'::jsonb);
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_audit_mvp_bonus ON public.mvp_bonus_proposals;
CREATE TRIGGER trg_audit_mvp_bonus
AFTER INSERT OR UPDATE ON public.mvp_bonus_proposals
FOR EACH ROW EXECUTE FUNCTION public.audit_mvp_bonus();

CREATE INDEX IF NOT EXISTS idx_mvp_bonus_cycle_subject
  ON public.mvp_bonus_proposals (cycle_id, subject_id, status);