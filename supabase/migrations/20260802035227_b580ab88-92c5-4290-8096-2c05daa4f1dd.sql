
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS documents_keywords_idx ON public.documents USING gin (keywords);
