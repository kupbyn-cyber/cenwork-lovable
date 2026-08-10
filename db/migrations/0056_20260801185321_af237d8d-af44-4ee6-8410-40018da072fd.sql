-- ============ REPORT-01: enums ============
create type public.report_kind as enum ('daily','weekly','project');
create type public.report_period_status as enum ('scheduled','open','closed');
create type public.report_exemption_status as enum ('pending','approved','rejected');

-- ============ Ngày không làm việc (nguồn lịch tối thiểu) ============
create table public.report_non_working_days (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  reason text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_nwd_scope check (team_id is null or user_id is null)
);
create unique index report_nwd_unique on public.report_non_working_days
  (day, coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid));
grant select, insert, update, delete on public.report_non_working_days to authenticated;
grant all on public.report_non_working_days to service_role;
alter table public.report_non_working_days enable row level security;

-- ============ Quy tắc báo cáo ============
create table public.report_requirements (
  id uuid primary key default gen_random_uuid(),
  report_type public.report_kind not null,
  team_id uuid references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  applies_all_teams boolean not null default false,
  cadence text not null default 'daily' check (cadence in ('daily','weekly','monthly')),
  open_day_of_week smallint check (open_day_of_week between 1 and 7),
  open_time time not null default '00:00',
  due_day_of_week smallint check (due_day_of_week between 1 and 7),
  due_time time not null default '23:59',
  requires_ack boolean not null default true,
  requires_evidence boolean not null default false,
  default_reviewer_id uuid references public.profiles(id),
  effective_from date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index report_requirements_scope_unique on public.report_requirements
  (report_type, coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where is_active;
grant select, insert, update on public.report_requirements to authenticated;
grant all on public.report_requirements to service_role;
alter table public.report_requirements enable row level security;

-- ============ Kỳ báo cáo ============
create table public.report_periods (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid references public.report_requirements(id) on delete set null,
  report_type public.report_kind not null,
  period_key text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  opens_at timestamptz not null,
  due_at timestamptz not null,
  team_id uuid references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  config_snapshot jsonb not null default '{}'::jsonb,
  status public.report_period_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index report_periods_unique on public.report_periods
  (report_type, period_key, coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid));
grant select on public.report_periods to authenticated;
grant all on public.report_periods to service_role;
alter table public.report_periods enable row level security;

-- ============ Nghĩa vụ báo cáo ============
create table public.report_obligations (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.report_periods(id) on delete cascade,
  report_type public.report_kind not null,
  period_key text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  reviewer_id uuid references public.profiles(id),
  due_at timestamptz not null,
  is_exempt boolean not null default false,
  exempt_reason text,
  first_submitted_at timestamptz,
  is_late boolean not null default false,
  late_minutes integer,
  report_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_obligations_period_user_unique unique (period_id, user_id)
);
create unique index report_obligations_type_key_user_unique on public.report_obligations (report_type, period_key, user_id);
create index report_obligations_user_idx on public.report_obligations (user_id, due_at desc);
create index report_obligations_team_idx on public.report_obligations (team_id, due_at desc);
grant select on public.report_obligations to authenticated;
grant all on public.report_obligations to service_role;
alter table public.report_obligations enable row level security;

-- ============ Người kiểm tra thay thế ============
create table public.report_reviewer_assignments (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.profiles(id) on delete cascade,
  delegate_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  report_type public.report_kind,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviewer_assignment_distinct check (principal_id <> delegate_id)
);
create index report_reviewer_assignments_principal_idx on public.report_reviewer_assignments (principal_id, is_active);
grant select, insert, update on public.report_reviewer_assignments to authenticated;
grant all on public.report_reviewer_assignments to service_role;
alter table public.report_reviewer_assignments enable row level security;

-- ============ Đề nghị miễn / điều chỉnh nghĩa vụ ============
create table public.report_exemption_requests (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.report_obligations(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  decided_by uuid references public.profiles(id),
  reason text not null,
  decision_note text,
  status public.report_exemption_status not null default 'pending',
  before_data jsonb,
  after_data jsonb,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert on public.report_exemption_requests to authenticated;
grant all on public.report_exemption_requests to service_role;
alter table public.report_exemption_requests enable row level security;

-- updated_at triggers
create trigger set_report_nwd_updated_at before update on public.report_non_working_days for each row execute function public.set_updated_at();
create trigger set_report_requirements_updated_at before update on public.report_requirements for each row execute function public.set_updated_at();
create trigger set_report_periods_updated_at before update on public.report_periods for each row execute function public.set_updated_at();
create trigger set_report_obligations_updated_at before update on public.report_obligations for each row execute function public.set_updated_at();
create trigger set_report_reviewer_assignments_updated_at before update on public.report_reviewer_assignments for each row execute function public.set_updated_at();
create trigger set_report_exemption_requests_updated_at before update on public.report_exemption_requests for each row execute function public.set_updated_at();

-- ============ Helper quyền ============
create or replace function public.report_config_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() = 'cmo';
$$;

create or replace function public.report_team_leader(_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teams t where t.id = _team and t.leader_id = auth.uid());
$$;

create or replace function public.report_cmo_id()
returns uuid language sql stable security definer set search_path = public as $$
  select ur.user_id from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where ur.role = 'cmo' order by ur.created_at limit 1;
$$;

/** Người kiểm tra hiệu lực: người thay thế còn hạn → mặc định → CMO. */
create or replace function public.report_effective_reviewer(_default uuid, _report_type public.report_kind, _team uuid, _at timestamptz default now())
returns uuid language plpgsql stable security definer set search_path = public as $$
declare _delegate uuid;
begin
  if _default is not null then
    select ra.delegate_id into _delegate
    from public.report_reviewer_assignments ra
    where ra.principal_id = _default
      and ra.is_active
      and ra.starts_at <= _at
      and (ra.ends_at is null or ra.ends_at > _at)
      and (ra.team_id is null or ra.team_id = _team)
      and (ra.report_type is null or ra.report_type = _report_type)
    order by ra.starts_at desc limit 1;
    if _delegate is not null then return _delegate; end if;
    return _default;
  end if;
  return public.report_cmo_id();
end; $$;

/** Người kiểm tra mặc định theo vai trò người gửi. */
create or replace function public.report_default_reviewer(_user uuid, _team uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare _leader uuid; _is_leader boolean;
begin
  select exists (select 1 from public.user_roles ur where ur.user_id = _user and ur.role in ('leader','cmo','admin')) into _is_leader;
  if _is_leader then return public.report_cmo_id(); end if;
  select t.leader_id into _leader from public.teams t where t.id = _team;
  if _leader is null or _leader = _user then return public.report_cmo_id(); end if;
  return _leader;
end; $$;

create or replace function public.report_is_non_working(_user uuid, _team uuid, _day date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.report_non_working_days d
    where d.day = _day
      and (d.team_id is null or d.team_id = _team)
      and (d.user_id is null or d.user_id = _user)
  );
$$;

-- ============ Audit triggers ============
create or replace function public.audit_report_requirement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    perform public.write_audit('report.requirement_created','report_requirement',NEW.id,null,to_jsonb(NEW),'{}'::jsonb);
    return NEW;
  end if;
  perform public.write_audit(
    case when NEW.is_active is distinct from OLD.is_active then 'report.requirement_toggled' else 'report.requirement_updated' end,
    'report_requirement', NEW.id, to_jsonb(OLD), to_jsonb(NEW), '{}'::jsonb);
  return NEW;
end; $$;
create trigger trg_audit_report_requirement after insert or update on public.report_requirements for each row execute function public.audit_report_requirement();

create or replace function public.audit_report_period()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit('report.period_created','report_period',NEW.id,null,
    jsonb_build_object('report_type',NEW.report_type,'period_key',NEW.period_key,'team_id',NEW.team_id,'due_at',NEW.due_at),'{}'::jsonb);
  return NEW;
end; $$;
create trigger trg_audit_report_period after insert on public.report_periods for each row execute function public.audit_report_period();

create or replace function public.audit_report_obligation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    perform public.write_audit('report.obligation_created','report_obligation',NEW.id,null,
      jsonb_build_object('user_id',NEW.user_id,'report_type',NEW.report_type,'period_key',NEW.period_key,'reviewer_id',NEW.reviewer_id,'due_at',NEW.due_at),'{}'::jsonb);
    return NEW;
  end if;
  if NEW.reviewer_id is distinct from OLD.reviewer_id then
    perform public.write_audit('report.obligation_reviewer_changed','report_obligation',NEW.id,
      jsonb_build_object('reviewer_id',OLD.reviewer_id), jsonb_build_object('reviewer_id',NEW.reviewer_id),'{}'::jsonb);
  end if;
  if NEW.is_exempt is distinct from OLD.is_exempt or NEW.due_at is distinct from OLD.due_at then
    perform public.write_audit('report.obligation_adjusted','report_obligation',NEW.id,
      jsonb_build_object('is_exempt',OLD.is_exempt,'due_at',OLD.due_at),
      jsonb_build_object('is_exempt',NEW.is_exempt,'due_at',NEW.due_at,'reason',NEW.exempt_reason),'{}'::jsonb);
  end if;
  return NEW;
end; $$;
create trigger trg_audit_report_obligation after insert or update on public.report_obligations for each row execute function public.audit_report_obligation();

create or replace function public.audit_report_reviewer_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit(case when TG_OP='INSERT' then 'report.reviewer_delegated' else 'report.reviewer_delegation_updated' end,
    'report_reviewer_assignment', NEW.id,
    case when TG_OP='INSERT' then null else to_jsonb(OLD) end, to_jsonb(NEW), '{}'::jsonb);
  return NEW;
end; $$;
create trigger trg_audit_report_reviewer_assignment after insert or update on public.report_reviewer_assignments for each row execute function public.audit_report_reviewer_assignment();

-- ============ Ràng buộc chỉnh sửa quy tắc của Leader ============
create or replace function public.enforce_report_requirement_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.report_config_manager() then
    if TG_OP = 'INSERT' then NEW.created_by := coalesce(NEW.created_by, auth.uid()); end if;
    return NEW;
  end if;
  -- Leader: chỉ sửa 2 tuỳ chọn của quy tắc báo cáo ngày thuộc Team mình
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
create trigger trg_enforce_report_requirement_write before insert or update on public.report_requirements for each row execute function public.enforce_report_requirement_write();

-- ============ RLS ============
create policy "report_nwd_select" on public.report_non_working_days for select to authenticated using (true);
create policy "report_nwd_insert" on public.report_non_working_days for insert to authenticated with check (public.report_config_manager() or (team_id is not null and public.report_team_leader(team_id)));
create policy "report_nwd_update" on public.report_non_working_days for update to authenticated using (public.report_config_manager()) with check (public.report_config_manager());
create policy "report_nwd_delete" on public.report_non_working_days for delete to authenticated using (public.report_config_manager());

create policy "report_requirements_select" on public.report_requirements for select to authenticated
  using (public.report_config_manager() or (team_id is not null and public.report_team_leader(team_id)));
create policy "report_requirements_insert" on public.report_requirements for insert to authenticated with check (public.report_config_manager());
create policy "report_requirements_update" on public.report_requirements for update to authenticated
  using (public.report_config_manager() or (report_type = 'daily' and team_id is not null and public.report_team_leader(team_id)))
  with check (public.report_config_manager() or (report_type = 'daily' and team_id is not null and public.report_team_leader(team_id)));

create policy "report_periods_select" on public.report_periods for select to authenticated
  using (
    public.report_config_manager()
    or (team_id is not null and public.report_team_leader(team_id))
    or exists (select 1 from public.report_obligations o where o.period_id = report_periods.id and o.user_id = auth.uid())
  );

create policy "report_obligations_select" on public.report_obligations for select to authenticated
  using (
    user_id = auth.uid()
    or reviewer_id = auth.uid()
    or public.report_config_manager()
    or (team_id is not null and public.report_team_leader(team_id))
  );

create policy "report_reviewer_assignments_select" on public.report_reviewer_assignments for select to authenticated
  using (public.report_config_manager() or principal_id = auth.uid() or delegate_id = auth.uid() or (team_id is not null and public.report_team_leader(team_id)));
create policy "report_reviewer_assignments_insert" on public.report_reviewer_assignments for insert to authenticated with check (public.report_config_manager());
create policy "report_reviewer_assignments_update" on public.report_reviewer_assignments for update to authenticated using (public.report_config_manager()) with check (public.report_config_manager());

create policy "report_exemption_select" on public.report_exemption_requests for select to authenticated
  using (
    requested_by = auth.uid()
    or public.report_config_manager()
    or exists (select 1 from public.report_obligations o where o.id = obligation_id and (o.user_id = auth.uid() or o.reviewer_id = auth.uid() or (o.team_id is not null and public.report_team_leader(o.team_id))))
  );
create policy "report_exemption_insert" on public.report_exemption_requests for insert to authenticated
  with check (
    requested_by = auth.uid()
    and exists (select 1 from public.report_obligations o where o.id = obligation_id and (o.user_id = auth.uid() or o.reviewer_id = auth.uid() or public.report_config_manager() or (o.team_id is not null and public.report_team_leader(o.team_id))))
  );

-- ============ Tạo kỳ và nghĩa vụ (idempotent) ============
create or replace function public.report_upsert_obligations(_period uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare _p record; _row record; _created integer := 0; _day date; _reviewer uuid; _default uuid;
begin
  select * into _p from public.report_periods where id = _period;
  if _p is null then return 0; end if;
  _day := (_p.period_start at time zone 'Asia/Ho_Chi_Minh')::date;

  for _row in
    select pr.id as user_id, pr.primary_team_id as team_id
    from public.profiles pr
    join public.user_roles ur on ur.user_id = pr.id and ur.role in ('member','leader')
    where pr.status = 'active'
      and pr.primary_team_id is not null
      and (_p.team_id is null or pr.primary_team_id = _p.team_id)
  loop
    if public.report_is_non_working(_row.user_id, _row.team_id, _day) then continue; end if;
    if exists (select 1 from public.report_obligations o where o.report_type = _p.report_type and o.period_key = _p.period_key and o.user_id = _row.user_id) then continue; end if;

    _default := public.report_default_reviewer(_row.user_id, _row.team_id);
    _reviewer := public.report_effective_reviewer(_default, _p.report_type, _row.team_id, _p.due_at);

    insert into public.report_obligations (period_id, report_type, period_key, user_id, team_id, reviewer_id, due_at)
    values (_p.id, _p.report_type, _p.period_key, _row.user_id, _row.team_id, _reviewer, _p.due_at);
    _created := _created + 1;
  end loop;
  return _created;
end; $$;

create or replace function public.report_generate_daily(_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _d date; _req record; _period uuid; _periods integer := 0; _obl integer := 0; _start timestamptz; _due timestamptz;
begin
  if not public.report_config_manager() and not exists (select 1 from public.teams t where t.leader_id = auth.uid()) then
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
  if not public.report_config_manager() and not exists (select 1 from public.teams t where t.leader_id = auth.uid()) then
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

/** Đồng bộ nghĩa vụ với báo cáo đã gửi (không suy đoán ngược: chỉ đánh dấu đã gửi). */
create or replace function public.report_sync_submission()
returns trigger language plpgsql security definer set search_path = public as $$
declare _key text; _kind public.report_kind;
begin
  if NEW.status is distinct from 'submitted' then return NEW; end if;
  if TG_TABLE_NAME = 'daily_reports' then
    _kind := 'daily'; _key := to_char(NEW.report_date,'YYYY-MM-DD');
    update public.report_obligations o
      set first_submitted_at = coalesce(o.first_submitted_at, now()),
          report_id = coalesce(o.report_id, NEW.id),
          is_late = coalesce(o.first_submitted_at, now()) > o.due_at,
          late_minutes = greatest(0, (extract(epoch from (coalesce(o.first_submitted_at, now()) - o.due_at))/60)::int)
      where o.report_type = _kind and o.period_key = _key and o.user_id = NEW.author_id;
  else
    _kind := 'weekly'; _key := to_char(NEW.week_start,'IYYY-"W"IW');
    update public.report_obligations o
      set first_submitted_at = coalesce(o.first_submitted_at, now()),
          report_id = coalesce(o.report_id, NEW.id),
          is_late = coalesce(o.first_submitted_at, now()) > o.due_at,
          late_minutes = greatest(0, (extract(epoch from (coalesce(o.first_submitted_at, now()) - o.due_at))/60)::int)
      where o.report_type = _kind and o.period_key = _key and o.user_id = NEW.leader_id;
  end if;
  return NEW;
end; $$;
create trigger trg_report_sync_daily after insert or update of status on public.daily_reports for each row execute function public.report_sync_submission();
create trigger trg_report_sync_weekly after insert or update of status on public.weekly_reports for each row execute function public.report_sync_submission();

/** Đề nghị miễn nghĩa vụ và quyết định (Leader trong Team, CMO toàn bộ). */
create or replace function public.report_decide_exemption(_request uuid, _approve boolean, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare _r record; _o record;
begin
  select * into _r from public.report_exemption_requests where id = _request;
  if _r is null then raise exception 'Không tìm thấy đề nghị.'; end if;
  if _r.status <> 'pending' then raise exception 'Đề nghị đã được xử lý.'; end if;
  select * into _o from public.report_obligations where id = _r.obligation_id;
  if not (public.report_config_manager() or (_o.team_id is not null and public.report_team_leader(_o.team_id))) then
    raise exception 'Bạn không có quyền xử lý đề nghị này.';
  end if;
  if _r.requested_by = auth.uid() and not public.report_config_manager() then
    raise exception 'Không thể tự phê duyệt đề nghị của chính mình.';
  end if;

  update public.report_exemption_requests
    set status = case when _approve then 'approved' else 'rejected' end,
        decided_by = auth.uid(), decided_at = now(), decision_note = _note,
        before_data = jsonb_build_object('is_exempt',_o.is_exempt,'exempt_reason',_o.exempt_reason),
        after_data = case when _approve then jsonb_build_object('is_exempt',true,'exempt_reason',_r.reason) else jsonb_build_object('is_exempt',_o.is_exempt) end
  where id = _request;

  if _approve then
    update public.report_obligations set is_exempt = true, exempt_reason = _r.reason where id = _o.id;
  end if;

  perform public.write_audit(
    case when _approve then 'report.exemption_approved' else 'report.exemption_rejected' end,
    'report_obligation', _o.id,
    jsonb_build_object('is_exempt',_o.is_exempt),
    jsonb_build_object('is_exempt',_approve,'reason',_r.reason,'note',_note), '{}'::jsonb);
end; $$;

/** Chuyển người kiểm tra về mặc định khi quyền thay thế hết hiệu lực. */
create or replace function public.report_refresh_reviewers()
returns integer language plpgsql security definer set search_path = public as $$
declare _o record; _new uuid; _n integer := 0;
begin
  if not public.report_config_manager() then raise exception 'Bạn không có quyền thao tác này.'; end if;
  for _o in select * from public.report_obligations where first_submitted_at is null and not is_exempt loop
    _new := public.report_effective_reviewer(public.report_default_reviewer(_o.user_id, _o.team_id), _o.report_type, _o.team_id, now());
    if _new is distinct from _o.reviewer_id then
      update public.report_obligations set reviewer_id = _new where id = _o.id;
      _n := _n + 1;
    end if;
  end loop;
  return _n;
end; $$;

grant execute on function public.report_config_manager() to authenticated;
grant execute on function public.report_team_leader(uuid) to authenticated;
grant execute on function public.report_cmo_id() to authenticated;
grant execute on function public.report_effective_reviewer(uuid, public.report_kind, uuid, timestamptz) to authenticated;
grant execute on function public.report_default_reviewer(uuid, uuid) to authenticated;
grant execute on function public.report_is_non_working(uuid, uuid, date) to authenticated;
grant execute on function public.report_generate_daily(date) to authenticated;
grant execute on function public.report_generate_weekly(date) to authenticated;
grant execute on function public.report_decide_exemption(uuid, boolean, text) to authenticated;
grant execute on function public.report_refresh_reviewers() to authenticated;