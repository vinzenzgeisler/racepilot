CREATE TABLE artifact_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('confirmation_pdf', 'entries_csv')),
  registration_group_id uuid,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  object_id uuid,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  content_type text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artifact_job_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT artifact_job_org_idempotency_unique UNIQUE (organization_id, idempotency_key),
  CONSTRAINT artifact_job_org_event_fk FOREIGN KEY (organization_id, event_id)
    REFERENCES event (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT artifact_job_group_fk FOREIGN KEY (organization_id, event_id, registration_group_id)
    REFERENCES registration_group (organization_id, event_id, id) ON DELETE CASCADE,
  CONSTRAINT artifact_job_kind_scope_check CHECK (
    (kind = 'confirmation_pdf' AND registration_group_id IS NOT NULL)
    OR (kind = 'entries_csv' AND registration_group_id IS NULL)
  ),
  CONSTRAINT artifact_job_object_metadata_check CHECK (
    (status = 'ready' AND object_id IS NOT NULL AND sha256 IS NOT NULL AND content_type IS NOT NULL)
    OR (status <> 'ready' AND object_id IS NULL AND sha256 IS NULL AND content_type IS NULL)
  )
);
CREATE INDEX artifact_job_org_status_idx ON artifact_job (organization_id, status, created_at);
