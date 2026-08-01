CREATE TABLE public.task_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_saved_views_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX task_saved_views_user_name_key
  ON public.task_saved_views (user_id, lower(btrim(name)));

CREATE UNIQUE INDEX task_saved_views_one_default_per_user
  ON public.task_saved_views (user_id) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_saved_views TO authenticated;
GRANT ALL ON public.task_saved_views TO service_role;

ALTER TABLE public.task_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own task views" ON public.task_saved_views
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users create own task views" ON public.task_saved_views
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own task views" ON public.task_saved_views
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own task views" ON public.task_saved_views
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER task_saved_views_set_updated_at
  BEFORE UPDATE ON public.task_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Đảm bảo mỗi người chỉ còn một chế độ mặc định khi đặt chế độ mới làm mặc định.
CREATE OR REPLACE FUNCTION public.task_saved_views_single_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.task_saved_views
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.task_saved_views_single_default() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER task_saved_views_single_default
  BEFORE INSERT OR UPDATE OF is_default ON public.task_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.task_saved_views_single_default();