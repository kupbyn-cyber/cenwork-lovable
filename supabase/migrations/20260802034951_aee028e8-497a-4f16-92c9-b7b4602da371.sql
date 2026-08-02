
CREATE OR REPLACE FUNCTION public.enforce_document_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_ok boolean;
BEGIN
  NEW.name := regexp_replace(btrim(NEW.name), '\s+', ' ', 'g');
  NEW.normalized_name := public.doc_normalize_name(NEW.name);
  IF NEW.normalized_name = '' THEN
    RAISE EXCEPTION 'Tên nội dung không được để trống.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.owner_id AND p.status = 'active')
    INTO v_owner_ok;
  IF NOT v_owner_ok THEN
    RAISE EXCEPTION 'Người phụ trách phải là tài khoản đang hoạt động.';
  END IF;

  NEW.display_name := public.doc_type_label(NEW.doc_type) || ' | ' || (
    CASE NEW.scope
      WHEN 'system' THEN 'Toàn hệ thống'
      WHEN 'team' THEN coalesce((SELECT t.name FROM public.teams t WHERE t.id = NEW.team_id), 'Team')
      ELSE coalesce((SELECT p.name FROM public.projects p WHERE p.id = NEW.project_id), 'Dự án')
    END) || ' | ' || NEW.name;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(auth.uid(), NEW.created_by);
    IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
      NEW.code := 'DOC-' || to_char(now(), 'YYMM') || '-' || upper(substr(replace(NEW.id::text,'-',''), 1, 6));
    END IF;
  ELSE
    NEW.code := OLD.code;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END; $$;
