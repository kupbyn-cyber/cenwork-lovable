-- REPORT-02 (2/3): business functions

CREATE OR REPLACE FUNCTION public.report_add_working_days(_from timestamptz, _days integer)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare _d date := (_from at time zone 'Asia/Ho_Chi_Minh')::date; _left integer := _days;
begin
  while _left > 0 loop
    _d := _d + 1;
    if extract(isodow from _d) < 6 and not public.report_is_non_working(null, null, _d) then
      _left := _left - 1;
    end if;
  end loop;
  return ((_d::text || ' 23:59:00')::timestamp at time zone 'Asia/Ho_Chi_Minh');
end; $$;

-- Bản chụp nguồn: chỉ giữ thông tin tối thiểu, không sao chép toàn bộ Task/Project.
CREATE OR REPLACE FUNCTION public.report_link_snapshot(_link uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare _l record; _t record; _p record;
begin
  select * into _l from public.report_links where id = _link;
  if _l is null then return '{}'::jsonb; end if;
  if _l.link_type = 'task' and _l.task_id is not null then
    select t.id, t.name, t.status::text as status, t.deadline, t.assignee_id, t.team_id, t.project_id,
           pr.display_name as assignee_name, pj.name as project_name
      into _t
      from public.tasks t
      left join public.profiles pr on pr.id = t.assignee_id
      left join public.projects pj on pj.id = t.project_id
     where t.id = _l.task_id;
    if _t is null then return jsonb_build_object('kind','task','id',_l.task_id,'missing',true); end if;
    return jsonb_build_object('kind','task','id',_t.id,'name',_t.name,'status',_t.status,
      'deadline',_t.deadline,'assignee_id',_t.assignee_id,'assignee_name',_t.assignee_name,
      'team_id',_t.team_id,'project_id',_t.project_id,'project_name',_t.project_name,
      'summary',_l.summary,'captured_at',now());
  elsif _l.link_type = 'project' and _l.project_id is not null then
    select p.id, p.name, p.status::text as status, p.deadline, p.owner_id, p.responsible_team_id,
           pr.display_name as owner_name
      into _p
      from public.projects p left join public.profiles pr on pr.id = p.owner_id
     where p.id = _l.project_id;
    if _p is null then return jsonb_build_object('kind','project','id',_l.project_id,'missing',true); end if;
    return jsonb_build_object('kind','project','id',_p.id,'name',_p.name,'status',_p.status,
      'deadline',_p.deadline,'owner_id',_p.owner_id,'owner_name',_p.owner_name,
      'team_id',_p.responsible_team_id,'summary',_l.summary,'captured_at',now());
  elsif _l.link_type = 'url' then
    return jsonb_build_object('kind','url','url',_l.url,'summary',_l.summary,'captured_at',now());
  end if;
  return jsonb_build_object('kind','text','text',_l.evidence_text,'captured_at',now());
end; $$;

CREATE OR REPLACE FUNCTION public.report_content_snapshot(_report uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'section_id', s.id, 'team_id', s.team_id, 'team_name', t.name,
    'done_work', s.done_work, 'results', s.results, 'unfinished', s.unfinished,
    'blockers', s.blockers, 'next_plan', s.next_plan, 'support_needed', s.support_needed,
    'no_work_flag', s.no_work_flag, 'no_work_reason', s.no_work_reason,
    'no_backlog_flag', s.no_backlog_flag) order by s.position, s.created_at), '[]'::jsonb)
  from public.report_sections s left join public.teams t on t.id = s.team_id
  where s.report_id = _report;
$$;

-- Tạo báo cáo cho một nghĩa vụ (idempotent), tách section theo Team của người gửi.
CREATE OR REPLACE FUNCTION public.report_ensure(_obligation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _o record; _p record; _report uuid; _requires boolean; _team uuid; _pos integer := 0;
begin
  select * into _o from public.report_obligations where id = _obligation;
  if _o is null then raise exception 'Không tìm thấy nghĩa vụ báo cáo'; end if;
  if auth.uid() is not null and _o.user_id <> auth.uid() then
    raise exception 'Bạn chỉ được tạo báo cáo cho nghĩa vụ của mình';
  end if;
  if _o.report_id is not null then return _o.report_id; end if;

  select * into _p from public.report_periods where id = _o.period_id;
  _requires := coalesce((_p.config_snapshot->>'requires_ack')::boolean, true);
  if _o.report_type = 'weekly' then _requires := true; end if;

  insert into public.reports (obligation_id, period_id, report_type, period_key, author_id, team_id,
                              project_id, requires_ack, due_at, reviewer_id)
  values (_obligation, _o.period_id, _o.report_type, _o.period_key, _o.user_id, _o.team_id,
          _p.project_id, _requires, _o.due_at, _o.reviewer_id)
  returning id into _report;

  for _team in
    select distinct x from (
      select _o.team_id as x
      union select tc.team_id from public.team_collaborators tc where tc.user_id = _o.user_id
      union select t.id from public.teams t where t.leader_id = _o.user_id
    ) q where x is not null
  loop
    insert into public.report_sections (report_id, team_id, position) values (_report, _team, _pos);
    _pos := _pos + 1;
  end loop;
  if _pos = 0 then insert into public.report_sections (report_id, team_id, position) values (_report, null, 0); end if;

  update public.report_obligations set report_id = _report where id = _obligation;
  perform public.write_audit('report.created','report',_report,null,
    jsonb_build_object('obligation_id',_obligation,'report_type',_o.report_type,'period_key',_o.period_key));
  return _report;
end; $$;

-- Người kiểm tra hiệu lực tại thời điểm hiện tại; tự lùi về mặc định hoặc CMO khi uỷ quyền hết hạn.
CREATE OR REPLACE FUNCTION public.report_current_reviewer(_report uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare _r record; _default uuid; _leader uuid;
begin
  select * into _r from public.reports where id = _report;
  if _r is null then return null; end if;
  if _r.report_type in ('project','project_closure') then
    select t.leader_id into _leader from public.teams t where t.id = _r.team_id;
    _default := case when _leader is null or _leader = _r.author_id then public.report_cmo_id() else _leader end;
  else
    _default := public.report_default_reviewer(_r.author_id, _r.team_id);
  end if;
  return public.report_effective_reviewer(_default, _r.report_type, _r.team_id, now());
end; $$;

CREATE OR REPLACE FUNCTION public.report_submit(_report uuid)
RETURNS public.report_doc_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _r record; _p record; _s record; _next public.report_doc_status; _kind public.report_submission_kind;
        _version integer; _now timestamptz := now(); _reviewer uuid; _link record;
begin
  select * into _r from public.reports where id = _report;
  if _r is null then raise exception 'Không tìm thấy báo cáo'; end if;
  if _r.author_id <> auth.uid() then raise exception 'Chỉ người gửi mới được gửi báo cáo này'; end if;
  if _r.status = 'confirmed' then raise exception 'Báo cáo đã xác nhận, cần yêu cầu mở lại'; end if;
  if _r.status = 'pending_review' or _r.status = 'submitted' then
    null; -- gửi lại khi chưa xác nhận
  end if;

  if _r.period_id is not null then
    select * into _p from public.report_periods where id = _r.period_id;
    if _p is not null and _now < _p.opens_at then
      raise exception 'Kỳ báo cáo chưa mở, chưa thể gửi';
    end if;
  end if;

  -- Kiểm tra nội dung bắt buộc theo từng section
  for _s in select * from public.report_sections where report_id = _report loop
    if _s.no_work_flag then
      if coalesce(btrim(_s.no_work_reason),'') = '' then
        raise exception 'Cần nhập lý do khi chọn không phát sinh công việc';
      end if;
    else
      if _r.report_type = 'daily' then
        if coalesce(btrim(_s.done_work),'') = '' or coalesce(btrim(_s.results),'') = ''
           or coalesce(btrim(_s.next_plan),'') = '' then
          raise exception 'Báo cáo ngày cần công việc đã thực hiện, kết quả và kế hoạch tiếp theo';
        end if;
      elsif _r.report_type = 'weekly' then
        if coalesce(btrim(_s.results),'') = '' or coalesce(btrim(_s.next_plan),'') = '' then
          raise exception 'Báo cáo tuần cần kết quả quan trọng và ưu tiên tuần tiếp theo';
        end if;
        if not _s.no_backlog_flag and coalesce(btrim(_s.unfinished),'') = '' then
          raise exception 'Cần nêu nội dung chưa hoàn thành hoặc xác nhận không có tồn đọng';
        end if;
      else
        if coalesce(btrim(_s.results),'') = '' or coalesce(btrim(_s.next_plan),'') = '' then
          raise exception 'Báo cáo dự án cần kết quả hoặc tiến độ và kế hoạch tiếp theo';
        end if;
      end if;
    end if;
  end loop;

  -- Bản chụp nguồn tại thời điểm gửi
  _version := _r.current_version + 1;
  for _link in select id from public.report_links where report_id = _report loop
    update public.report_links
       set snapshot = public.report_link_snapshot(_link.id), snapshot_version = _version
     where id = _link.id;
  end loop;

  _kind := case when _r.first_submitted_at is null then 'initial'
                when _r.status = 'reopened' then 'reopen' else 'resubmit' end;
  _next := case when _r.requires_ack then 'pending_review' else 'submitted' end;
  _reviewer := coalesce(public.report_current_reviewer(_report), _r.reviewer_id);

  insert into public.report_versions (report_id, version, submission_kind, content_snapshot, source_snapshot, created_by)
  values (_report, _version, _kind, public.report_content_snapshot(_report),
          coalesce((select jsonb_agg(l.snapshot) from public.report_links l where l.report_id = _report), '[]'::jsonb),
          auth.uid());

  update public.reports
     set status = _next,
         current_version = _version,
         first_submitted_at = coalesce(first_submitted_at, _now),
         last_submitted_at = _now,
         reviewer_id = _reviewer
   where id = _report;

  -- Đúng hạn/gửi muộn chỉ tính một lần theo lần gửi đầu tiên
  if _r.obligation_id is not null and _r.first_submitted_at is null then
    update public.report_obligations o
       set first_submitted_at = _now,
           report_id = _report,
           is_late = _now > o.due_at,
           late_minutes = greatest(0, (extract(epoch from (_now - o.due_at))/60)::int)
     where o.id = _r.obligation_id and o.first_submitted_at is null;
  end if;

  perform public.write_audit(
    case when _kind = 'initial' then 'report.submitted' else 'report.resubmitted' end,
    'report', _report,
    jsonb_build_object('status', _r.status, 'version', _r.current_version),
    jsonb_build_object('status', _next, 'version', _version));

  if _reviewer is not null and _r.requires_ack then
    perform public.notify_user(_reviewer, 'report.pending_review', 'Báo cáo chờ xác nhận',
      null, 'report', _report, '/reports/doc/' || _report::text,
      'report.pending_review.' || _report::text || '.' || _version::text);
  end if;
  return _next;
end; $$;

CREATE OR REPLACE FUNCTION public.report_review(_report uuid, _action public.report_review_action, _body text)
RETURNS public.report_doc_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _r record; _reviewer uuid; _next public.report_doc_status; _round integer;
begin
  select * into _r from public.reports where id = _report;
  if _r is null then raise exception 'Không tìm thấy báo cáo'; end if;
  if _r.author_id = auth.uid() then raise exception 'Không được tự xử lý báo cáo của mình'; end if;
  _reviewer := public.report_current_reviewer(_report);
  if not (auth.uid() = _reviewer or public.report_config_manager()) then
    raise exception 'Bạn không phải người kiểm tra của báo cáo này';
  end if;
  if _action not in ('comment','request_revision','confirm') then
    raise exception 'Hành động không hợp lệ';
  end if;
  if _action <> 'comment' and _r.status not in ('submitted','pending_review') then
    raise exception 'Báo cáo không ở trạng thái chờ xử lý';
  end if;
  if _action = 'request_revision' and coalesce(btrim(_body),'') = '' then
    raise exception 'Cần nhập nội dung yêu cầu bổ sung';
  end if;

  _round := _r.revision_round + case when _action = 'request_revision' then 1 else 0 end;
  _next := case _action when 'request_revision' then 'revision_required'
                        when 'confirm' then 'confirmed' else _r.status end;

  insert into public.report_reviews (report_id, version, round, actor_id, action, body)
  values (_report, _r.current_version, _round, auth.uid(), _action, _body);

  update public.reports
     set status = _next, revision_round = _round, reviewer_id = _reviewer,
         confirmed_by = case when _action = 'confirm' then auth.uid() else confirmed_by end,
         confirmed_at = case when _action = 'confirm' then now() else confirmed_at end
   where id = _report;

  perform public.write_audit('report.' || _action::text, 'report', _report,
    jsonb_build_object('status', _r.status), jsonb_build_object('status', _next, 'body', _body));

  perform public.notify_user(_r.author_id,
    case _action when 'confirm' then 'report.confirmed'
                 when 'request_revision' then 'report.revision_required'
                 else 'report.comment' end,
    case _action when 'confirm' then 'Báo cáo đã được xác nhận'
                 when 'request_revision' then 'Báo cáo cần bổ sung'
                 else 'Có phản hồi mới cho báo cáo' end,
    _body, 'report', _report, '/reports/doc/' || _report::text,
    'report.' || _action::text || '.' || _report::text || '.' || _round::text || '.' || _r.current_version::text);
  return _next;
end; $$;

CREATE OR REPLACE FUNCTION public.report_reopen_request(_report uuid, _reason text, _planned text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _r record; _id uuid;
begin
  select * into _r from public.reports where id = _report;
  if _r is null then raise exception 'Không tìm thấy báo cáo'; end if;
  if _r.author_id <> auth.uid() then raise exception 'Chỉ người gửi được yêu cầu mở lại'; end if;
  if _r.status <> 'confirmed' then raise exception 'Chỉ báo cáo đã xác nhận mới cần mở lại'; end if;
  if coalesce(btrim(_reason),'') = '' or coalesce(btrim(_planned),'') = '' then
    raise exception 'Cần nêu lý do và nội dung dự kiến sửa';
  end if;
  if exists (select 1 from public.report_reopen_requests where report_id = _report and status = 'pending') then
    raise exception 'Đã có yêu cầu mở lại đang chờ xử lý';
  end if;
  insert into public.report_reopen_requests (report_id, requested_by, reason, planned_changes)
  values (_report, auth.uid(), _reason, _planned) returning id into _id;
  insert into public.report_reviews (report_id, version, round, actor_id, action, body)
  values (_report, _r.current_version, _r.revision_round, auth.uid(), 'reopen_request', _reason);
  perform public.write_audit('report.reopen_requested','report',_report,null,
    jsonb_build_object('request_id',_id,'reason',_reason,'planned_changes',_planned));
  perform public.notify_user(coalesce(_r.confirmed_by, public.report_cmo_id()),
    'report.reopen_requested','Yêu cầu mở lại báo cáo', _reason, 'report', _report,
    '/reports/doc/' || _report::text, 'report.reopen_requested.' || _id::text);
  return _id;
end; $$;

CREATE OR REPLACE FUNCTION public.report_reopen_decide(_request uuid, _approve boolean, _note text)
RETURNS public.report_doc_status LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _q record; _r record; _next public.report_doc_status;
begin
  select * into _q from public.report_reopen_requests where id = _request;
  if _q is null then raise exception 'Không tìm thấy yêu cầu'; end if;
  if _q.status <> 'pending' then raise exception 'Yêu cầu đã được xử lý'; end if;
  select * into _r from public.reports where id = _q.report_id;
  if not (auth.uid() = _r.confirmed_by or public.report_config_manager()) then
    raise exception 'Chỉ người đã xác nhận hoặc CMO được xử lý yêu cầu mở lại';
  end if;
  if not _approve and coalesce(btrim(_note),'') = '' then
    raise exception 'Cần nêu lý do từ chối';
  end if;

  update public.report_reopen_requests
     set status = case when _approve then 'approved' else 'rejected' end::public.report_exemption_status,
         decided_by = auth.uid(), decided_at = now(), decision_note = _note
   where id = _request;

  _next := case when _approve then 'reopened' else 'confirmed' end::public.report_doc_status;
  if _approve then
    update public.reports set status = 'reopened' where id = _r.id;
  end if;

  insert into public.report_reviews (report_id, version, round, actor_id, action, body)
  values (_r.id, _r.current_version, _r.revision_round, auth.uid(),
          case when _approve then 'reopen_approve' else 'reopen_reject' end, _note);

  perform public.write_audit(case when _approve then 'report.reopen_approved' else 'report.reopen_rejected' end,
    'report', _r.id, jsonb_build_object('status', _r.status),
    jsonb_build_object('status', _next, 'note', _note));
  perform public.notify_user(_r.author_id,
    case when _approve then 'report.reopened' else 'report.reopen_rejected' end,
    case when _approve then 'Báo cáo đã được mở lại' else 'Yêu cầu mở lại bị từ chối' end,
    _note, 'report', _r.id, '/reports/doc/' || _r.id::text,
    'report.reopen_decided.' || _request::text);
  return _next;
end; $$;

-- Gợi ý Task/Project có hoạt động trong kỳ, chỉ trong quyền xem của người gửi.
CREATE OR REPLACE FUNCTION public.report_suggest_sources(_report uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare _r record; _p record; _from timestamptz; _to timestamptz;
begin
  select * into _r from public.reports where id = _report;
  if _r is null then return '[]'::jsonb; end if;
  if not (auth.uid() = _r.author_id or public.report_doc_visible(_report)) then return '[]'::jsonb; end if;
  select * into _p from public.report_periods where id = _r.period_id;
  _from := coalesce(_p.period_start, date_trunc('day', now()));
  _to := coalesce(_p.period_end, now());

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind','task','id',t.id,'name',t.name,'status',t.status::text,'deadline',t.deadline,
      'project_id',t.project_id,'project_name',pj.name,'team_id',t.team_id,'updated_at',t.updated_at))
    from public.tasks t
    left join public.projects pj on pj.id = t.project_id
    where t.assignee_id = _r.author_id
      and t.deleted_at is null
      and public.can_view_task(t.id)
      and (
        (t.updated_at >= _from and t.updated_at < _to)
        or (t.deadline >= _from and t.deadline < _to)
        or (t.completed_at is not null and t.completed_at >= _from and t.completed_at < _to)
      )
  ), '[]'::jsonb);
end; $$;

-- ============ Báo cáo dự án ============
CREATE OR REPLACE FUNCTION public.report_generate_project(_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _d date := coalesce(_day, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
        _req record; _pj record; _period uuid; _key text; _periods int := 0; _obl int := 0;
        _default uuid; _reviewer uuid; _leader uuid; _due timestamptz; _start timestamptz;
begin
  if auth.uid() is not null and not public.report_config_manager() and public.current_app_role() <> 'leader' then
    raise exception 'Bạn không có quyền tạo kỳ báo cáo';
  end if;
  for _req in select * from public.report_requirements
              where report_type = 'project' and is_active
                and effective_from <= _d and (effective_to is null or effective_to >= _d) loop
    for _pj in select p.* from public.projects p
               where p.deleted_at is null and p.status = 'in_progress'
                 and (_req.project_id is null or p.id = _req.project_id)
                 and (_req.team_id is null or p.responsible_team_id = _req.team_id)
                 and p.owner_id is not null loop
      _key := to_char(_d, 'IYYY-"W"IW') || '-' || left(_pj.id::text, 8);
      _start := ((_d - 6)::text || ' 00:00:00')::timestamp at time zone 'Asia/Ho_Chi_Minh';
      _due := ((_d::text || ' ' || to_char(_req.due_time,'HH24:MI:SS'))::timestamp at time zone 'Asia/Ho_Chi_Minh');
      insert into public.report_periods (requirement_id, report_type, period_key, period_start, period_end,
        opens_at, due_at, team_id, project_id, config_snapshot, status)
      values (_req.id, 'project', _key, _start, _due, _start, _due, _pj.responsible_team_id, _pj.id,
        jsonb_build_object('requires_ack', _req.requires_ack, 'requires_evidence', _req.requires_evidence,
                           'due_time', _req.due_time, 'source','requirement'),
        'open'::public.report_period_status)
      on conflict do nothing
      returning id into _period;
      if _period is null then
        select id into _period from public.report_periods
         where report_type = 'project' and period_key = _key and project_id = _pj.id;
      else
        _periods := _periods + 1;
      end if;

      if not exists (select 1 from public.report_obligations o
                     where o.period_id = _period and o.user_id = _pj.owner_id) then
        select t.leader_id into _leader from public.teams t where t.id = _pj.responsible_team_id;
        _default := case when _leader is null or _leader = _pj.owner_id then public.report_cmo_id() else _leader end;
        _reviewer := public.report_effective_reviewer(_default, 'project', _pj.responsible_team_id, _due);
        insert into public.report_obligations (period_id, report_type, period_key, user_id, team_id, reviewer_id, due_at)
        values (_period, 'project', _key, _pj.owner_id, _pj.responsible_team_id, _reviewer, _due);
        _obl := _obl + 1;
      end if;
      _period := null;
    end loop;
  end loop;
  return jsonb_build_object('day', _d, 'periods_created', _periods, 'obligations_created', _obl);
end; $$;

CREATE OR REPLACE FUNCTION public.report_exempt_obligation(_obligation uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _o record;
begin
  select * into _o from public.report_obligations where id = _obligation;
  if _o is null then raise exception 'Không tìm thấy nghĩa vụ'; end if;
  if not (public.report_config_manager() or (_o.team_id is not null and public.report_team_leader(_o.team_id))) then
    raise exception 'Bạn không có quyền miễn kỳ báo cáo này';
  end if;
  if coalesce(btrim(_reason),'') = '' then raise exception 'Cần nêu lý do miễn kỳ'; end if;
  update public.report_obligations set is_exempt = true, exempt_reason = _reason where id = _obligation;
  perform public.write_audit('report_obligation.exempted','report_obligation',_obligation,
    to_jsonb(_o), jsonb_build_object('is_exempt', true, 'exempt_reason', _reason));
end; $$;

CREATE OR REPLACE FUNCTION public.report_transfer_author(_report uuid, _new_author uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _r record;
begin
  select * into _r from public.reports where id = _report;
  if _r is null then raise exception 'Không tìm thấy báo cáo'; end if;
  if not (public.report_config_manager() or (_r.team_id is not null and public.report_team_leader(_r.team_id))) then
    raise exception 'Bạn không có quyền chuyển trách nhiệm báo cáo';
  end if;
  if coalesce(btrim(_reason),'') = '' then raise exception 'Cần nêu lý do chuyển trách nhiệm'; end if;
  update public.reports set author_id = _new_author where id = _report;
  if _r.obligation_id is not null then
    update public.report_obligations set user_id = _new_author where id = _r.obligation_id;
  end if;
  perform public.write_audit('report.author_transferred','report',_report,
    jsonb_build_object('author_id', _r.author_id),
    jsonb_build_object('author_id', _new_author, 'reason', _reason));
  perform public.notify_user(_new_author, 'report.author_transferred', 'Bạn được giao gửi báo cáo dự án',
    _reason, 'report', _report, '/reports/doc/' || _report::text,
    'report.author_transferred.' || _report::text || '.' || _new_author::text);
end; $$;

-- Báo cáo kết thúc dự án
CREATE OR REPLACE FUNCTION public.report_project_closure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _due timestamptz; _key text; _period uuid; _leader uuid; _default uuid; _reviewer uuid; _open record;
begin
  if NEW.status = OLD.status then return NEW; end if;
  if NEW.status not in ('completed','archived') then return NEW; end if;
  if NEW.owner_id is null then return NEW; end if;

  _due := public.report_add_working_days(now(), 3);
  _key := 'closure-' || left(NEW.id::text, 8);

  -- Kỳ định kỳ đang mở và chưa xác nhận thì chuyển thành báo cáo kết thúc, không tạo trùng
  select o.* into _open from public.report_obligations o
    join public.report_periods p on p.id = o.period_id
   where p.project_id = NEW.id and o.report_type = 'project' and not o.is_exempt
     and (o.report_id is null or exists (select 1 from public.reports r
            where r.id = o.report_id and r.status <> 'confirmed'))
   order by o.due_at desc limit 1;

  if _open.id is not null then
    update public.report_periods set report_type = 'project_closure', due_at = _due,
      status = 'open'::public.report_period_status where id = _open.period_id;
    update public.report_obligations set report_type = 'project_closure', due_at = _due where id = _open.id;
    if _open.report_id is not null then
      update public.reports set report_type = 'project_closure', due_at = _due where id = _open.report_id;
    end if;
    perform public.write_audit('report.period_converted_to_closure','report_obligation',_open.id,
      jsonb_build_object('report_type','project'), jsonb_build_object('report_type','project_closure','due_at',_due));
    return NEW;
  end if;

  insert into public.report_periods (report_type, period_key, period_start, period_end, opens_at, due_at,
    team_id, project_id, config_snapshot, status)
  values ('project_closure', _key, now(), _due, now(), _due, NEW.responsible_team_id, NEW.id,
    jsonb_build_object('requires_ack', true, 'source','project_closure',
                       'project_status', NEW.status::text), 'open'::public.report_period_status)
  on conflict do nothing
  returning id into _period;
  if _period is null then return NEW; end if;

  select t.leader_id into _leader from public.teams t where t.id = NEW.responsible_team_id;
  _default := case when _leader is null or _leader = NEW.owner_id then public.report_cmo_id() else _leader end;
  _reviewer := public.report_effective_reviewer(_default, 'project_closure', NEW.responsible_team_id, _due);

  insert into public.report_obligations (period_id, report_type, period_key, user_id, team_id, reviewer_id, due_at)
  values (_period, 'project_closure', _key, NEW.owner_id, NEW.responsible_team_id, _reviewer, _due)
  on conflict do nothing;

  perform public.write_audit('report.closure_required','project',NEW.id,null,
    jsonb_build_object('due_at',_due,'owner_id',NEW.owner_id,'project_status',NEW.status::text));
  perform public.notify_user(NEW.owner_id,'report.closure_required','Cần gửi báo cáo kết thúc dự án',
    NEW.name, 'project', NEW.id, '/reports', 'report.closure_required.' || NEW.id::text);
  return NEW;
end; $$;

DROP TRIGGER IF EXISTS trg_report_project_closure ON public.projects;
CREATE TRIGGER trg_report_project_closure AFTER UPDATE OF status ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.report_project_closure();

-- ============ Tổng hợp Team hằng tuần ============
CREATE OR REPLACE FUNCTION public.team_summary_ensure(_team uuid, _week_start date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _id uuid; _snapshot jsonb; _key text := to_char(_week_start,'IYYY-"W"IW');
begin
  if not public.report_team_leader(_team) then
    raise exception 'Chỉ Leader của Team được dựng bản tổng hợp';
  end if;

  select jsonb_build_object(
    'week_key', _key,
    'obligations', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', o.user_id, 'name', pr.display_name, 'due_at', o.due_at,
        'submitted_at', o.first_submitted_at, 'is_late', o.is_late, 'is_exempt', o.is_exempt))
      from public.report_obligations o join public.profiles pr on pr.id = o.user_id
      where o.report_type = 'weekly' and o.period_key = _key and o.team_id = _team), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(jsonb_build_object(
        'author', pr.display_name, 'results', s.results, 'unfinished', s.unfinished,
        'blockers', s.blockers, 'next_plan', s.next_plan, 'support_needed', s.support_needed,
        'no_backlog_flag', s.no_backlog_flag))
      from public.report_sections s
      join public.reports r on r.id = s.report_id
      join public.profiles pr on pr.id = r.author_id
      where s.team_id = _team and r.report_type = 'weekly' and r.period_key = _key
        and r.status <> 'draft'), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'status', t.status::text, 'deadline', t.deadline))
      from public.tasks t
      where t.team_id = _team and t.deleted_at is null
        and t.updated_at >= (_week_start::text || ' 00:00:00')::timestamp at time zone 'Asia/Ho_Chi_Minh'
        and t.updated_at < ((_week_start + 7)::text || ' 00:00:00')::timestamp at time zone 'Asia/Ho_Chi_Minh'), '[]'::jsonb),
    'built_at', now()
  ) into _snapshot;

  select id into _id from public.team_weekly_summaries where team_id = _team and week_start = _week_start;
  if _id is null then
    insert into public.team_weekly_summaries (team_id, week_start, leader_id, system_snapshot)
    values (_team, _week_start, auth.uid(), _snapshot) returning id into _id;
    perform public.write_audit('team_summary.created','team_summary',_id,null,
      jsonb_build_object('team_id',_team,'week_start',_week_start));
  else
    update public.team_weekly_summaries set system_snapshot = _snapshot where id = _id and status in ('draft','revision_required');
  end if;
  return _id;
end; $$;

CREATE OR REPLACE FUNCTION public.team_summary_publish(_summary uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _s record; _version integer;
begin
  select * into _s from public.team_weekly_summaries where id = _summary;
  if _s is null then raise exception 'Không tìm thấy bản tổng hợp'; end if;
  if _s.leader_id <> auth.uid() then raise exception 'Chỉ Leader phụ trách được phát hành'; end if;
  if _s.status = 'published' then raise exception 'Bản tổng hợp đã phát hành'; end if;
  if coalesce(btrim(_s.highlights),'') = '' or coalesce(btrim(_s.next_priorities),'') = '' then
    raise exception 'Cần có kết quả nổi bật và ưu tiên tuần tiếp theo';
  end if;
  _version := _s.current_version + 1;
  insert into public.team_summary_versions (summary_id, version, content_snapshot, system_snapshot, created_by)
  values (_summary, _version, jsonb_build_object('highlights',_s.highlights,'unfinished',_s.unfinished,
    'blockers',_s.blockers,'next_priorities',_s.next_priorities,'support_needed',_s.support_needed,
    'submission_note',_s.submission_note), _s.system_snapshot, auth.uid());
  update public.team_weekly_summaries
     set status = 'published', current_version = _version, published_at = now() where id = _summary;
  perform public.write_audit('team_summary.published','team_summary',_summary,
    jsonb_build_object('status',_s.status), jsonb_build_object('status','published','version',_version));
  perform public.notify_user(public.report_cmo_id(), 'team_summary.published','Tổng hợp Team đã phát hành',
    null, 'team_summary', _summary, '/reports', 'team_summary.published.' || _summary::text || '.' || _version::text);
end; $$;

CREATE OR REPLACE FUNCTION public.team_summary_feedback(_summary uuid, _request_revision boolean, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare _s record;
begin
  select * into _s from public.team_weekly_summaries where id = _summary;
  if _s is null then raise exception 'Không tìm thấy bản tổng hợp'; end if;
  if not public.report_config_manager() then raise exception 'Chỉ CMO được phản hồi bản tổng hợp'; end if;
  if coalesce(btrim(_body),'') = '' then raise exception 'Cần nhập nội dung phản hồi'; end if;
  insert into public.report_reviews (summary_id, version, round, actor_id, action, body)
  values (_summary, _s.current_version, 0, auth.uid(),
          case when _request_revision then 'request_revision' else 'summary_feedback' end, _body);
  if _request_revision then
    update public.team_weekly_summaries set status = 'revision_required' where id = _summary;
  end if;
  perform public.write_audit('team_summary.feedback','team_summary',_summary,
    jsonb_build_object('status',_s.status),
    jsonb_build_object('status', case when _request_revision then 'revision_required' else _s.status end,'body',_body));
  perform public.notify_user(_s.leader_id, 'team_summary.feedback',
    case when _request_revision then 'Tổng hợp Team cần bổ sung' else 'CMO phản hồi tổng hợp Team' end,
    _body, 'team_summary', _summary, '/reports',
    'team_summary.feedback.' || _summary::text || '.' || extract(epoch from now())::bigint::text);
end; $$;

-- ============ quyền gọi hàm ============
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'report_add_working_days(timestamptz,integer)',
    'report_link_snapshot(uuid)',
    'report_content_snapshot(uuid)',
    'report_ensure(uuid)',
    'report_current_reviewer(uuid)',
    'report_submit(uuid)',
    'report_review(uuid,public.report_review_action,text)',
    'report_reopen_request(uuid,text,text)',
    'report_reopen_decide(uuid,boolean,text)',
    'report_suggest_sources(uuid)',
    'report_generate_project(date)',
    'report_exempt_obligation(uuid,text)',
    'report_transfer_author(uuid,uuid,text)',
    'team_summary_ensure(uuid,date)',
    'team_summary_publish(uuid)',
    'team_summary_feedback(uuid,boolean,text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM public, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.report_project_closure() FROM public, anon, authenticated';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.report_doc_visible(uuid) FROM public, anon';
END $$;