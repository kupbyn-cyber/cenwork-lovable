CREATE OR REPLACE FUNCTION public.audit_project_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row jsonb := to_jsonb(COALESCE(NEW, OLD));
  _kind text := CASE TG_TABLE_NAME
    WHEN 'project_teams' THEN 'team'
    WHEN 'project_members' THEN 'member'
    ELSE 'facility' END;
  _ref uuid := NULLIF(COALESCE(_row->>'team_id', _row->>'user_id', _row->>'facility_id'), '')::uuid;
BEGIN
  PERFORM public.write_audit(
    'project.' || _kind || CASE WHEN TG_OP='INSERT' THEN '_linked' ELSE '_unlinked' END,
    'project', (_row->>'project_id')::uuid, NULL, jsonb_build_object('ref_id', _ref));
  RETURN COALESCE(NEW, OLD);
END; $function$;