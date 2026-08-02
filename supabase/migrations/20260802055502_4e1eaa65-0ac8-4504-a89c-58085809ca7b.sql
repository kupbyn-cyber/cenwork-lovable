create or replace function public.approval_participants(_request uuid)
returns table(id uuid, display_name text, email text, is_active boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.email, (p.status = 'active') as is_active
  from public.profiles p
  where public.approval_can_view(_request)
    and (
      p.id = (select r.sender_id from public.approval_requests r where r.id = _request)
      or p.id in (
        select d.approver_id from public.approval_decisions d where d.approval_request_id = _request
      )
    )
$$;

revoke all on function public.approval_participants(uuid) from public, anon;
grant execute on function public.approval_participants(uuid) to authenticated;