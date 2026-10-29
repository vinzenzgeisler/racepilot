CREATE TABLE participant_status_access_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  registration_group_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  locale text NOT NULL DEFAULT 'de' CHECK (locale IN ('de','en')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participant_status_access_group_fk FOREIGN KEY (organization_id,event_id,registration_group_id)
    REFERENCES registration_group(organization_id,event_id,id) ON DELETE CASCADE
);
CREATE INDEX participant_status_access_expiry_idx ON participant_status_access_token(expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
ALTER TABLE email_template_version DROP CONSTRAINT email_template_version_key_check;
ALTER TABLE email_template_version ADD CONSTRAINT email_template_version_key_check
  CHECK (template_key IN ('verification','entry-received','accepted','rejected','status-change','participant-status-access'));
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_key_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_key_check
  CHECK (template_key IN ('verification','entry-received','accepted','rejected','status-change','participant-status-access'));
