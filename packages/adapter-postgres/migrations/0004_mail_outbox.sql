CREATE TABLE email_template_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  template_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  locale text NOT NULL CHECK (locale IN ('de','en')),
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_template_version_org_id_unique UNIQUE (organization_id,id),
  CONSTRAINT email_template_version_org_key_version_unique UNIQUE (organization_id,template_key,version),
  CONSTRAINT email_template_version_org_fk FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);
CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid,
  template_key text NOT NULL,
  template_version integer NOT NULL CHECK (template_version > 0),
  locale text NOT NULL CHECK (locale IN ('de','en')),
  recipient text NOT NULL,
  idempotency_key text NOT NULL,
  variables jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_outbox_org_id_unique UNIQUE (organization_id,id),
  CONSTRAINT email_outbox_org_idempotency_unique UNIQUE (organization_id,idempotency_key),
  CONSTRAINT email_outbox_org_event_fk FOREIGN KEY (organization_id,event_id) REFERENCES event(organization_id,id),
  CONSTRAINT email_outbox_org_fk FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);
CREATE INDEX email_outbox_due_idx ON email_outbox(available_at) WHERE status IN ('pending','sending');
CREATE TABLE email_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  outbox_id uuid NOT NULL,
  attempt integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('sent','retry','failed')),
  error text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_delivery_org_outbox_fk FOREIGN KEY (organization_id,outbox_id) REFERENCES email_outbox(organization_id,id) ON DELETE CASCADE,
  CONSTRAINT email_delivery_org_attempt_unique UNIQUE (organization_id,outbox_id,attempt)
);
