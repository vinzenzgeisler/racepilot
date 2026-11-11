ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_key_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_key_check
  CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign'));
ALTER TABLE email_template_version DROP CONSTRAINT email_template_version_key_check;
ALTER TABLE email_template_version ADD CONSTRAINT email_template_version_key_check
  CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign'));

CREATE TABLE message_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  event_id uuid,
  name text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, event_id) REFERENCES event(organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX message_template_org_event_name_unique ON message_template(organization_id, event_id, name);

CREATE TABLE message_campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','sending','sent','failed')),
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, event_id) REFERENCES event(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE message_campaign_recipient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  event_id uuid NOT NULL,
  entry_id uuid,
  outbox_id uuid,
  email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','sending','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, campaign_id) REFERENCES message_campaign(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, entry_id) REFERENCES entry(organization_id, event_id, id),
  FOREIGN KEY (organization_id, outbox_id) REFERENCES email_outbox(organization_id, id),
  UNIQUE (organization_id, campaign_id, email)
);
CREATE INDEX message_campaign_event_idx ON message_campaign(organization_id, event_id, created_at DESC);
CREATE INDEX message_campaign_recipient_outbox_idx ON message_campaign_recipient(organization_id, outbox_id) WHERE outbox_id IS NOT NULL;

CREATE TABLE message_campaign_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, campaign_id) REFERENCES message_campaign(organization_id, id) ON DELETE CASCADE
);
