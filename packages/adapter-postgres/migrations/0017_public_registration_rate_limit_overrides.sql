CREATE TABLE organization_public_registration_rate_limit_override (
  organization_id uuid PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  organization_limit integer,
  event_limit integer,
  window_seconds integer,
  CHECK (organization_limit IS NULL OR organization_limit BETWEEN 1 AND 100000),
  CHECK (event_limit IS NULL OR event_limit BETWEEN 1 AND 100000),
  CHECK (window_seconds IS NULL OR window_seconds BETWEEN 1 AND 86400),
  CHECK (organization_limit IS NOT NULL OR event_limit IS NOT NULL OR window_seconds IS NOT NULL)
);

CREATE TABLE event_public_registration_rate_limit_override (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  event_limit integer,
  window_seconds integer,
  PRIMARY KEY (organization_id, event_id),
  FOREIGN KEY (organization_id, event_id)
    REFERENCES event(organization_id, id) ON DELETE CASCADE,
  CHECK (event_limit IS NULL OR event_limit BETWEEN 1 AND 100000),
  CHECK (window_seconds IS NULL OR window_seconds BETWEEN 1 AND 86400),
  CHECK (event_limit IS NOT NULL OR window_seconds IS NOT NULL)
);

CREATE TABLE public_registration_rate_limit_override_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  event_id uuid,
  scope text NOT NULL CHECK (scope IN ('organization', 'event')),
  actor text NOT NULL,
  before_settings jsonb,
  after_settings jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, event_id)
    REFERENCES event(organization_id, id) ON DELETE CASCADE,
  CHECK ((scope = 'organization' AND event_id IS NULL) OR (scope = 'event' AND event_id IS NOT NULL))
);

CREATE INDEX public_registration_rate_limit_override_audit_org_idx
  ON public_registration_rate_limit_override_audit(organization_id, occurred_at);
