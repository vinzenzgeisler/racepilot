-- Fixed status meanings, event-configurable status dimensions and independent hints.
ALTER TABLE entry
  ADD COLUMN status_hints jsonb NOT NULL DEFAULT
    '{"double_starter":false,"passenger":false,"late_entry":false}'::jsonb;
ALTER TABLE entry
  ADD CONSTRAINT entry_status_hints_shape_check CHECK (
    jsonb_typeof(status_hints) = 'object'
    AND jsonb_typeof(status_hints->'double_starter') = 'boolean'
    AND jsonb_typeof(status_hints->'passenger') = 'boolean'
    AND jsonb_typeof(status_hints->'late_entry') = 'boolean'
  );

CREATE TABLE event_entry_status_dimension_config (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  actor text NOT NULL CHECK (length(trim(actor)) > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, event_id),
  FOREIGN KEY (organization_id, event_id)
    REFERENCES event(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE event_entry_status_dimension_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  actor text NOT NULL CHECK (length(trim(actor)) > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  before_config jsonb,
  after_config jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, event_id)
    REFERENCES event(organization_id, id) ON DELETE CASCADE
);
CREATE INDEX event_entry_status_dimension_config_audit_event_idx
  ON event_entry_status_dimension_config_audit(organization_id, event_id, occurred_at);

-- Only manually-managed dimensions are stored here. Payment and email status are
-- projections from invoice and email-verification source records respectively.
CREATE TABLE entry_status_dimension_value (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  dimension text NOT NULL CHECK (dimension IN ('technical_inspection','waiver')),
  value text NOT NULL CHECK (length(trim(value)) > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, entry_id, dimension),
  FOREIGN KEY (organization_id, event_id, entry_id)
    REFERENCES entry(organization_id, event_id, id) ON DELETE CASCADE
);
CREATE INDEX entry_status_dimension_value_event_idx
  ON entry_status_dimension_value(organization_id, event_id, dimension, value);

CREATE TABLE entry_status_dimension_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  dimension text NOT NULL CHECK (dimension IN ('technical_inspection','waiver')),
  from_value text NOT NULL,
  to_value text NOT NULL,
  actor text NOT NULL CHECK (length(trim(actor)) > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, event_id, entry_id)
    REFERENCES entry(organization_id, event_id, id) ON DELETE CASCADE
);
CREATE INDEX entry_status_dimension_audit_entry_idx
  ON entry_status_dimension_audit(organization_id, entry_id, occurred_at);

CREATE TABLE entry_status_hints_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  before_hints jsonb NOT NULL,
  after_hints jsonb NOT NULL,
  actor text NOT NULL CHECK (length(trim(actor)) > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, event_id, entry_id)
    REFERENCES entry(organization_id, event_id, id) ON DELETE CASCADE
);

-- Preserve existing Nennung/email statuses; initialize new dimensions to their
-- documented defaults without rewriting workflow or invoice history.
INSERT INTO entry_status_dimension_value
  (organization_id, event_id, entry_id, dimension, value)
SELECT organization_id, event_id, id, 'technical_inspection', 'pending' FROM entry;
INSERT INTO entry_status_dimension_value
  (organization_id, event_id, entry_id, dimension, value)
SELECT organization_id, event_id, id, 'waiver', 'f_pending' FROM entry;

CREATE FUNCTION initialize_entry_status_dimensions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO entry_status_dimension_value
    (organization_id, event_id, entry_id, dimension, value)
  VALUES
    (NEW.organization_id, NEW.event_id, NEW.id, 'technical_inspection', 'pending'),
    (NEW.organization_id, NEW.event_id, NEW.id, 'waiver', 'f_pending');
  RETURN NEW;
END;
$$;
CREATE TRIGGER entry_status_dimensions_default
  AFTER INSERT ON entry FOR EACH ROW EXECUTE FUNCTION initialize_entry_status_dimensions();
