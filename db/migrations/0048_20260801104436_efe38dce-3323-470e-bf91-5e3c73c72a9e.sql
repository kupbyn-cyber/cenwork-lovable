ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS telegram_test_status text,
  ADD COLUMN IF NOT EXISTS telegram_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_test_error text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_number_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_number_format
  CHECK (phone_number IS NULL OR phone_number ~ '^[0-9+][0-9 .()-]{7,19}$');

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_telegram_test_status_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_telegram_test_status_valid
  CHECK (telegram_test_status IS NULL OR telegram_test_status IN ('success','failed'));