ALTER TABLE public.mvp_cycle_tasks
  ADD COLUMN IF NOT EXISTS final_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS snapshot_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluded_reason text;

CREATE INDEX IF NOT EXISTS mvp_cycle_tasks_cycle_active_idx
  ON public.mvp_cycle_tasks (cycle_id) WHERE excluded_at IS NULL;

UPDATE public.mvp_cycle_tasks ct
SET final_completed_at = t.completed_at
FROM public.tasks t
WHERE t.id = ct.task_id
  AND ct.final_completed_at IS NULL
  AND t.completed_at IS NOT NULL;