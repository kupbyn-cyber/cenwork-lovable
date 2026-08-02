CREATE OR REPLACE FUNCTION public.attachment_path_can_read(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE parts text[]; _id uuid;
BEGIN
  parts := string_to_array(_name, '/');
  IF array_length(parts, 1) < 3 THEN RETURN false; END IF;
  BEGIN _id := parts[2]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  IF parts[1] = 'approval' THEN RETURN public.approval_can_view(_id); END IF;
  IF parts[1] = 'announcement' THEN RETURN public.can_view_announcement(_id); END IF;
  RETURN false;
END; $$;

CREATE OR REPLACE FUNCTION public.attachment_path_can_write(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE parts text[]; _id uuid;
BEGIN
  parts := string_to_array(_name, '/');
  IF array_length(parts, 1) < 3 THEN RETURN false; END IF;
  BEGIN _id := parts[2]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  IF NOT public.is_active_account(auth.uid()) THEN RETURN false; END IF;
  IF parts[1] = 'approval' THEN
    RETURN EXISTS (SELECT 1 FROM public.approval_requests r WHERE r.id = _id AND r.sender_id = auth.uid());
  END IF;
  IF parts[1] = 'announcement' THEN
    RETURN public.announcement_author(_id) = auth.uid();
  END IF;
  RETURN false;
END; $$;

REVOKE ALL ON FUNCTION public.attachment_path_can_read(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attachment_path_can_write(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attachment_path_can_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attachment_path_can_write(text) TO authenticated;

CREATE POLICY "attachments_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND public.attachment_path_can_read(name));

CREATE POLICY "attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND public.attachment_path_can_write(name));

CREATE POLICY "attachments_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'attachments' AND public.attachment_path_can_write(name))
  WITH CHECK (bucket_id = 'attachments' AND public.attachment_path_can_write(name));

CREATE POLICY "attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND public.attachment_path_can_write(name));