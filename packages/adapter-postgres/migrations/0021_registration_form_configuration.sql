ALTER TABLE organization ADD COLUMN registration_form_config jsonb;
ALTER TABLE event ADD COLUMN registration_form_config jsonb;

CREATE TABLE registration_form_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  event_id uuid,
  actor text NOT NULL,
  before_config jsonb,
  after_config jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registration_form_config_audit_event_fk
    FOREIGN KEY (organization_id,event_id) REFERENCES event(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX registration_form_config_audit_scope_idx
  ON registration_form_config_audit(organization_id,event_id,occurred_at DESC);

CREATE TABLE registration_form_draft (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  email_normalized text NOT NULL,
  recipient_email text NOT NULL,
  language text NOT NULL CHECK (language IN ('de','en')),
  draft_data jsonb NOT NULL CHECK (jsonb_typeof(draft_data) = 'object'),
  resume_token_hash text NOT NULL UNIQUE CHECK (resume_token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registration_form_draft_event_fk FOREIGN KEY (organization_id,event_id)
    REFERENCES event(organization_id,id) ON DELETE CASCADE,
  CONSTRAINT registration_form_draft_scope_email_unique UNIQUE (organization_id,event_id,email_normalized)
);
CREATE INDEX registration_form_draft_expiry_idx ON registration_form_draft(expires_at);
ALTER TABLE email_template_version DROP CONSTRAINT email_template_version_key_check;
ALTER TABLE email_template_version ADD CONSTRAINT email_template_version_key_check CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change'));
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_key_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_key_check CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change'));
