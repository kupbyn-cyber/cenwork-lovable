DROP POLICY IF EXISTS documents_select ON public.documents;
CREATE POLICY documents_select ON public.documents
FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    created_by = auth.uid()
    OR owner_id = auth.uid()
    OR public.can_view_document(id)
  )
);