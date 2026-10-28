CREATE TABLE organization_module (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  module_id text NOT NULL CHECK (module_id ~ '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$'),
  enabled boolean NOT NULL,
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  version integer NOT NULL CHECK (version >= 1),
  module_version text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, module_id)
);
CREATE TABLE event_module (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  module_id text NOT NULL CHECK (module_id ~ '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$'),
  enabled boolean NOT NULL,
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  version integer NOT NULL CHECK (version >= 1),
  module_version text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, event_id, module_id),
  CONSTRAINT event_module_event_fk FOREIGN KEY (organization_id, event_id)
    REFERENCES event(organization_id, id) ON DELETE CASCADE
);
CREATE TABLE module_activation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  event_id uuid,
  module_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('enable','disable','configure')),
  actor text NOT NULL,
  reason text,
  version integer NOT NULL CHECK (version >= 1),
  before_state jsonb,
  after_state jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_activation_audit_event_fk FOREIGN KEY (organization_id, event_id)
    REFERENCES event(organization_id, id) ON DELETE CASCADE
);
CREATE INDEX module_activation_audit_scope_idx
  ON module_activation_audit(organization_id, event_id, module_id, occurred_at);
