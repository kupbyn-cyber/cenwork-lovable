create or replace function public.enforce_report_requirement_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.report_config_manager() then
    if TG_OP = 'INSERT' then NEW.created_by := coalesce(NEW.created_by, auth.uid()); end if;
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.report_type = 'daily' and OLD.team_id is not null and public.report_team_leader(OLD.team_id) then
    if NEW.report_type is distinct from OLD.report_type
       or NEW.team_id is distinct from OLD.team_id
       or NEW.project_id is distinct from OLD.project_id
       or NEW.applies_all_teams is distinct from OLD.applies_all_teams
       or NEW.cadence is distinct from OLD.cadence
       or NEW.open_time is distinct from OLD.open_time
       or NEW.due_time is distinct from OLD.due_time
       or NEW.effective_from is distinct from OLD.effective_from
       or NEW.effective_to is distinct from OLD.effective_to
       or NEW.default_reviewer_id is distinct from OLD.default_reviewer_id
       or NEW.is_active is distinct from OLD.is_active then
      raise exception 'Leader chỉ được đổi tuỳ chọn xác nhận và bằng chứng của báo cáo ngày trong Team mình.';
    end if;
    return NEW;
  end if;
  raise exception 'Bạn không có quyền thay đổi quy tắc báo cáo.';
end; $$;

create or replace function public.report_generate_daily(_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _d date; _req record; _period uuid; _periods integer := 0; _obl integer := 0; _start timestamptz; _due timestamptz;
begin
  if auth.uid() is not null and not public.report_config_manager()
     and not exists (select 1 from public.teams t where t.leader_id = auth.uid()) then
    raise exception 'Bạn không có quyền tạo kỳ báo cáo.';
  end if;
  _d := coalesce(_day, (now() at time zone 'Asia/Ho_Chi_Minh')::date);

  for _req in
    select r.*, t.id as scope_team
    from public.report_requirements r
    left join public.teams t on (r.applies_all_teams or t.id = r.team_id)
    where r.report_type = 'daily' and r.is_active
      and r.effective_from <= _d and (r.effective_to is null or r.effective_to >= _d)
      and t.id is not null
  loop
    _start := (_d::text || ' 00:00')::timestamp at time zone 'Asia/Ho_Chi_Minh';
    _due := (_d::text || ' ' || to_char(_req.due_time,'HH24:MI'))::timestamp at time zone 'Asia/Ho_Chi_Minh';

    insert into public.report_periods (requirement_id, report_type, period_key, period_start, period_end, opens_at, due_at, team_id, config_snapshot, status)
    values (_req.id, 'daily', to_char(_d,'YYYY-MM-DD'), _start, _due, _start, _due, _req.scope_team,
      jsonb_build_object('requires_ack',_req.requires_ack,'requires_evidence',_req.requires_evidence,'due_time',_req.due_time,'cadence',_req.cadence),
      case when now() >= _start then 'open' else 'scheduled' end)
    on conflict do nothing
    returning id into _period;

    if _period is not null then _periods := _periods + 1; end if;
    if _period is null then
      select id into _period from public.report_periods
      where report_type = 'daily' and period_key = to_char(_d,'YYYY-MM-DD') and team_id is not distinct from _req.scope_team;
    end if;
    _obl := _obl + public.report_upsert_obligations(_period);
    _period := null;
  end loop;

  return jsonb_build_object('day', _d, 'periods_created', _periods, 'obligations_created', _obl);
end; $$;

create or replace function public.report_generate_weekly(_week_start date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _w date; _req record; _period uuid; _periods integer := 0; _obl integer := 0; _start timestamptz; _end timestamptz; _open timestamptz; _due timestamptz;
begin
  if auth.uid() is not null and not public.report_config_manager()
     and not exists (select 1 from public.teams t where t.leader_id = auth.uid()) then
    raise exception 'Bạn không có quyền tạo kỳ báo cáo.';
  end if;
  _w := coalesce(_week_start, date_trunc('week', (now() at time zone 'Asia/Ho_Chi_Minh'))::date);
  _w := date_trunc('week', _w::timestamp)::date;

  for _req in
    select r.*, t.id as scope_team
    from public.report_requirements r
    left join public.teams t on (r.applies_all_teams or t.id = r.team_id)
    where r.report_type = 'weekly' and r.is_active
      and r.effective_from <= _w + 6 and (r.effective_to is null or r.effective_to >= _w)
      and t.id is not null
  loop
    _start := (_w::text || ' 00:00')::timestamp at time zone 'Asia/Ho_Chi_Minh';
    _end := ((_w + 6)::text || ' 23:59')::timestamp at time zone 'Asia/Ho_Chi_Minh';
    _open := ((_w + coalesce(_req.open_day_of_week, 5) - 1)::text || ' ' || to_char(_req.open_time,'HH24:MI'))::timestamp at time zone 'Asia/Ho_Chi_Minh';
    _due := ((_w + coalesce(_req.due_day_of_week, 7) - 1)::text || ' ' || to_char(_req.due_time,'HH24:MI'))::timestamp at time zone 'Asia/Ho_Chi_Minh';

    insert into public.report_periods (requirement_id, report_type, period_key, period_start, period_end, opens_at, due_at, team_id, config_snapshot, status)
    values (_req.id, 'weekly', to_char(_w,'IYYY-"W"IW'), _start, _end, _open, _due, _req.scope_team,
      jsonb_build_object('requires_ack',true,'requires_evidence',_req.requires_evidence,'open_time',_req.open_time,'due_time',_req.due_time,'cadence',_req.cadence),
      case when now() >= _open then 'open' else 'scheduled' end)
    on conflict do nothing
    returning id into _period;

    if _period is not null then _periods := _periods + 1; end if;
    if _period is null then
      select id into _period from public.report_periods
      where report_type = 'weekly' and period_key = to_char(_w,'IYYY-"W"IW') and team_id is not distinct from _req.scope_team;
    end if;
    _obl := _obl + public.report_upsert_obligations(_period);
    _period := null;
  end loop;

  return jsonb_build_object('week_start', _w, 'periods_created', _periods, 'obligations_created', _obl);
end; $$;

revoke execute on function public.report_generate_daily(date) from public, anon;
revoke execute on function public.report_generate_weekly(date) from public, anon;
grant execute on function public.report_generate_daily(date) to authenticated;
grant execute on function public.report_generate_weekly(date) to authenticated;