ALTER TABLE organization
  ADD COLUMN registration_settings jsonb NOT NULL DEFAULT '{"sharedContactEmail":"allowed","minimumAge":null,"guardianRequiredBelowAge":18,"maximumClassesPerGroup":8}'::jsonb;
ALTER TABLE organization ADD CONSTRAINT organization_registration_settings_check CHECK (jsonb_typeof(registration_settings) = 'object' AND registration_settings ?& ARRAY['sharedContactEmail','minimumAge','guardianRequiredBelowAge','maximumClassesPerGroup'] AND (registration_settings - 'sharedContactEmail' - 'minimumAge' - 'guardianRequiredBelowAge' - 'maximumClassesPerGroup') = '{}'::jsonb AND registration_settings->>'sharedContactEmail' IN ('allowed','disallowed') AND (registration_settings->>'guardianRequiredBelowAge')::integer BETWEEN 0 AND 100 AND (registration_settings->>'maximumClassesPerGroup')::integer BETWEEN 1 AND 100 AND (jsonb_typeof(registration_settings->'minimumAge') = 'null' OR (registration_settings->>'minimumAge')::integer BETWEEN 0 AND 100));
ALTER TABLE event ADD COLUMN consent_terms jsonb NOT NULL DEFAULT '[]'::jsonb;
DROP INDEX IF EXISTS person_org_email_unique;
ALTER TABLE registration_group
  ADD COLUMN contact_email text,
  ADD COLUMN guardian_name text,
  ADD COLUMN guardian_email text;

CREATE TABLE public_entry_submission (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  registration_group_id uuid,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,event_id,submission_id),
  CONSTRAINT public_entry_submission_event_fk FOREIGN KEY (organization_id,event_id)
    REFERENCES event(organization_id,id) ON DELETE CASCADE,
  CONSTRAINT public_entry_submission_group_fk FOREIGN KEY (organization_id,event_id,registration_group_id)
    REFERENCES registration_group(organization_id,event_id,id)
);
CREATE TABLE registration_group_email_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  registration_group_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_email_verification_group_fk FOREIGN KEY (organization_id,event_id,registration_group_id)
    REFERENCES registration_group(organization_id,event_id,id) ON DELETE CASCADE
);
CREATE INDEX group_email_verification_expiry_idx ON registration_group_email_verification(expires_at) WHERE consumed_at IS NULL;
CREATE TABLE consent_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  registration_group_id uuid NOT NULL,
  text_key text NOT NULL,
  text_version text NOT NULL,
  language text NOT NULL CHECK (language IN ('de','en')),
  text_hash text NOT NULL CHECK (text_hash ~ '^[a-f0-9]{64}$'),
  accepted_at timestamptz NOT NULL,
  CONSTRAINT consent_evidence_group_fk FOREIGN KEY (organization_id,event_id,registration_group_id)
    REFERENCES registration_group(organization_id,event_id,id) ON DELETE CASCADE
);
CREATE INDEX consent_evidence_group_idx ON consent_evidence(organization_id,registration_group_id);
CREATE TABLE registration_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  actor text NOT NULL,
  before_settings jsonb NOT NULL,
  after_settings jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_consent_terms_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  actor text NOT NULL,
  before_terms jsonb NOT NULL,
  after_terms jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_consent_terms_audit_event_fk FOREIGN KEY (organization_id,event_id)
    REFERENCES event(organization_id,id) ON DELETE CASCADE
);
