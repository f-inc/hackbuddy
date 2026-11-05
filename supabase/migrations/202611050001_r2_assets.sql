ALTER TABLE public.hackbuddy_assets ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'r2';
ALTER TABLE public.hackbuddy_assets ADD COLUMN IF NOT EXISTS submission_id text;
ALTER TABLE public.hackbuddy_assets ADD COLUMN IF NOT EXISTS source_field text;
CREATE INDEX IF NOT EXISTS hackbuddy_assets_submission ON public.hackbuddy_assets(event_id,submission_id);
CREATE INDEX IF NOT EXISTS hackbuddy_assets_sha256 ON public.hackbuddy_assets(sha256);
CREATE UNIQUE INDEX IF NOT EXISTS hackbuddy_assets_object ON public.hackbuddy_assets(storage_provider,bucket,object_path);
