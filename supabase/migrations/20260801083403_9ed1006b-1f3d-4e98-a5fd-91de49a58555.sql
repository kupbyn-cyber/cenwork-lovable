GRANT EXECUTE ON FUNCTION
  public.can_assign_task(uuid, uuid, uuid),
  public.can_create_task(uuid),
  public.can_edit_task_row(uuid),
  public.can_manage_task(uuid),
  public.can_review_daily_report(uuid),
  public.can_review_weekly_report(),
  public.can_view_daily_report(uuid, uuid),
  public.can_view_task(uuid),
  public.can_view_weekly_report(uuid),
  public.is_in_project_scope(uuid, uuid)
TO authenticated;