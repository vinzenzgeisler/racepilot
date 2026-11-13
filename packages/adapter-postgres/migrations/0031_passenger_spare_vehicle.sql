ALTER TABLE event_class ADD COLUMN passenger_mode text NOT NULL DEFAULT 'optional';
ALTER TABLE event_class ADD CONSTRAINT event_class_passenger_mode_check
  CHECK (passenger_mode IN ('none','optional','required'));

ALTER TABLE entry ADD COLUMN spare_vehicle_id uuid;
ALTER TABLE entry ADD CONSTRAINT entry_org_spare_vehicle_fk
  FOREIGN KEY (organization_id, spare_vehicle_id) REFERENCES vehicle (organization_id, id);
ALTER TABLE entry ADD CONSTRAINT entry_spare_vehicle_distinct_check
  CHECK (spare_vehicle_id IS NULL OR spare_vehicle_id <> vehicle_id);

CREATE TABLE entry_passenger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  email_normalized text,
  date_of_birth date,
  country text,
  phone text,
  street text,
  postal_code text,
  city text,
  emergency_contact_name text,
  emergency_contact_phone text,
  language text NOT NULL DEFAULT 'de',
  source text NOT NULL,
  created_by text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_passenger_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT entry_passenger_org_entry_unique UNIQUE (organization_id, entry_id),
  CONSTRAINT entry_passenger_entry_fk FOREIGN KEY (organization_id, event_id, entry_id)
    REFERENCES entry (organization_id, event_id, id) ON DELETE CASCADE,
  CONSTRAINT entry_passenger_language_check CHECK (language IN ('de','en')),
  CONSTRAINT entry_passenger_source_check CHECK (source IN ('registration','admin')),
  CONSTRAINT entry_passenger_name_check CHECK (length(trim(first_name)) > 0 AND length(trim(last_name)) > 0),
  CONSTRAINT entry_passenger_created_by_check CHECK (length(trim(created_by)) > 0)
);

CREATE TABLE entry_passenger_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  passenger_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_passenger_link_hash_check CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT entry_passenger_link_passenger_fk FOREIGN KEY (organization_id, passenger_id)
    REFERENCES entry_passenger (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX entry_passenger_link_passenger_idx ON entry_passenger_link (organization_id, passenger_id);

CREATE TABLE entry_passenger_consent_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  passenger_id uuid NOT NULL,
  text_key text NOT NULL,
  text_version text NOT NULL,
  language text NOT NULL,
  text_hash text NOT NULL,
  accepted_at timestamptz NOT NULL,
  CONSTRAINT entry_passenger_consent_passenger_fk FOREIGN KEY (organization_id, passenger_id)
    REFERENCES entry_passenger (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX entry_passenger_consent_idx ON entry_passenger_consent_evidence (organization_id, passenger_id);

ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_key_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_key_check
  CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link'));
ALTER TABLE email_template_version DROP CONSTRAINT email_template_version_key_check;
ALTER TABLE email_template_version ADD CONSTRAINT email_template_version_key_check
  CHECK (template_key IN ('verification','registration-resume','entry-received','accepted','rejected','status-change','message-campaign','passenger-link'));
