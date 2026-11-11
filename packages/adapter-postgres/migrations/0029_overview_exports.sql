ALTER TABLE artifact_job ADD COLUMN filters jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE artifact_job ADD COLUMN delimiter text NOT NULL DEFAULT ';';
ALTER TABLE artifact_job ADD COLUMN expires_at timestamptz;
ALTER TABLE artifact_job ADD CONSTRAINT artifact_job_delimiter_check CHECK (delimiter in (',',';'));

CREATE TABLE artifact_job_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  artifact_job_id uuid NOT NULL,
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artifact_job_audit_event_fk FOREIGN KEY (organization_id, event_id)
    REFERENCES event (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT artifact_job_audit_job_fk FOREIGN KEY (organization_id, artifact_job_id)
    REFERENCES artifact_job (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX artifact_job_audit_org_event_idx ON artifact_job_audit (organization_id, event_id, occurred_at);
