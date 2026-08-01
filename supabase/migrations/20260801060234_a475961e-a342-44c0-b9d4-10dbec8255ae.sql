ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS audience_all_users boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audience_all_teams boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_self boolean NOT NULL DEFAULT false;