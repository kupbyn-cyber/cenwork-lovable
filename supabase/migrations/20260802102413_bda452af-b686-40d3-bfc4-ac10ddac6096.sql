REVOKE EXECUTE ON FUNCTION
  public.is_system_owner(uuid), public.perm_role_of(uuid), public.perm_invariant_keys(),
  public.perm_effective(uuid), public.perm_effective_for(uuid), public.has_perm(uuid, text),
  public.perm_scope(uuid, text), public.perm_apply_changes(jsonb, text, text),
  public.perm_revert_change_set(uuid, text), public.perm_clear_user_overrides(uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.is_system_owner(uuid), public.perm_role_of(uuid), public.perm_invariant_keys(),
  public.perm_effective(uuid), public.perm_effective_for(uuid), public.has_perm(uuid, text),
  public.perm_scope(uuid, text), public.perm_apply_changes(jsonb, text, text),
  public.perm_revert_change_set(uuid, text), public.perm_clear_user_overrides(uuid, text)
TO authenticated;