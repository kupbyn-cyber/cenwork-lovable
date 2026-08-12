-- MVP-FIX-01: gỡ các CHECK cũ (thang 0/2.5/5/7.5/10) xung đột với thang 0-5.
ALTER TABLE public.mvp_manual_reviews DROP CONSTRAINT IF EXISTS mvp_reviews_quality_scale;
ALTER TABLE public.mvp_manual_reviews DROP CONSTRAINT IF EXISTS mvp_reviews_proactive_scale;
ALTER TABLE public.mvp_manual_reviews DROP CONSTRAINT IF EXISTS mvp_reviews_teamwork_scale;
ALTER TABLE public.mvp_manual_reviews DROP CONSTRAINT IF EXISTS mvp_manual_reviews_scale_chk;
ALTER TABLE public.mvp_manual_reviews ADD CONSTRAINT mvp_manual_reviews_scale_chk CHECK (
  quality_score IN (0,1,2,3,4,5)
  AND proactive_score IN (0,1,2,3,4,5)
  AND impact_score IN (0,1,2,3,4,5)
  AND teamwork_score IN (0,1,2,3,4,5)
);