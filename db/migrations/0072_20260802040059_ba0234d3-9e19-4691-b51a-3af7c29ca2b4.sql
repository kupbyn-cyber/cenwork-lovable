GRANT EXECUTE ON FUNCTION public.can_view_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_document(public.document_scope, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_is_published(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doc_normalize_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doc_type_label(public.document_type) TO authenticated;