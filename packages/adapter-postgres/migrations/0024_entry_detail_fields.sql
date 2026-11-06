ALTER TABLE person
  ADD COLUMN phone text,
  ADD COLUMN street text,
  ADD COLUMN postal_code text,
  ADD COLUMN city text,
  ADD COLUMN emergency_contact_name text,
  ADD COLUMN emergency_contact_phone text,
  ADD COLUMN publication_preference text;
ALTER TABLE person ADD CONSTRAINT person_publication_preference_check
  CHECK (publication_preference IS NULL OR publication_preference IN ('name_visible','initials','hidden'));
ALTER TABLE vehicle
  ADD COLUMN vehicle_type text,
  ADD COLUMN displacement_cc integer,
  ADD COLUMN cylinders integer,
  ADD COLUMN owner_name text,
  ADD COLUMN history text;
ALTER TABLE vehicle ADD CONSTRAINT vehicle_displacement_check
  CHECK (displacement_cc IS NULL OR displacement_cc BETWEEN 1 AND 20000);
ALTER TABLE vehicle ADD CONSTRAINT vehicle_cylinders_check
  CHECK (cylinders IS NULL OR cylinders BETWEEN 1 AND 24);
CREATE TABLE entry_data_audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  subject text NOT NULL,
  changes jsonb NOT NULL,
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_data_audit_subject_check CHECK (subject IN ('driver','vehicle')),
  CONSTRAINT entry_data_audit_actor_check CHECK (length(trim(actor)) > 0),
  CONSTRAINT entry_data_audit_entry_fk FOREIGN KEY (organization_id, entry_id)
    REFERENCES entry (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX entry_data_audit_entry_idx
  ON entry_data_audit_event (organization_id, entry_id, occurred_at);
