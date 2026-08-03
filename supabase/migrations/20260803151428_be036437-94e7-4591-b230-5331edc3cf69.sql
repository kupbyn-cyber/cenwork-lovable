ALTER TABLE public.recognitions ADD COLUMN IF NOT EXISTS seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.recognition_unseen()
RETURNS TABLE(
  id uuid,
  sender_id uuid,
  sender_name text,
  category recognition_category,
  message text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.sender_id, p.display_name, r.category, r.message, r.created_at
  FROM public.recognitions r
  LEFT JOIN public.profiles p ON p.id = r.sender_id
  WHERE r.receiver_id = auth.uid()
    AND r.sender_id <> auth.uid()
    AND r.revoked_at IS NULL
    AND r.seen_at IS NULL
  ORDER BY r.created_at DESC
  LIMIT 20
$$;

CREATE OR REPLACE FUNCTION public.recognition_mark_seen()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  UPDATE public.recognitions
     SET seen_at = now()
   WHERE receiver_id = auth.uid()
     AND seen_at IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.recognition_unseen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recognition_mark_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recognition_unseen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recognition_mark_seen() TO authenticated;