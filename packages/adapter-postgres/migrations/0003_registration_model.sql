CREATE TABLE person (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
  first_name text NOT NULL, last_name text NOT NULL, email text, email_normalized text, date_of_birth date,
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, deletion_reason text,
  CONSTRAINT person_org_fk FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  CONSTRAINT person_org_id_unique UNIQUE (organization_id,id),
  CONSTRAINT person_deleted_reason_check CHECK (deleted_at IS NULL OR deletion_reason IS NOT NULL)
);
-- Soft-deleted people release their email for a new person record.
CREATE UNIQUE INDEX person_org_email_unique ON person(organization_id,email_normalized) WHERE deleted_at IS NULL;
CREATE TABLE vehicle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
  make text NOT NULL, model text NOT NULL, year integer, registration text,
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, deletion_reason text,
  CONSTRAINT vehicle_org_fk FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  CONSTRAINT vehicle_org_id_unique UNIQUE (organization_id,id),
  CONSTRAINT vehicle_deleted_reason_check CHECK (deleted_at IS NULL OR deletion_reason IS NOT NULL)
);
CREATE TABLE registration_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL, person_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT registration_group_org_id_unique UNIQUE (organization_id,id),
  CONSTRAINT registration_group_org_event_id_unique UNIQUE (organization_id,event_id,id),
  CONSTRAINT registration_group_org_event_person_unique UNIQUE (organization_id,event_id,id,person_id),
  CONSTRAINT registration_group_org_event_fk FOREIGN KEY (organization_id,event_id) REFERENCES event(organization_id,id) ON DELETE CASCADE,
  CONSTRAINT registration_group_org_person_fk FOREIGN KEY (organization_id,person_id) REFERENCES person(organization_id,id)
);
CREATE TABLE entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL, class_id uuid NOT NULL,
  registration_group_id uuid NOT NULL, driver_person_id uuid NOT NULL, vehicle_id uuid NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified', acceptance_status text NOT NULL DEFAULT 'pending',
  requested_start_number text, price_snapshot_version text, form_snapshot_version text,
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, deletion_reason text,
  CONSTRAINT entry_org_id_unique UNIQUE (organization_id,id),
  CONSTRAINT entry_org_event_fk FOREIGN KEY (organization_id,event_id) REFERENCES event(organization_id,id) ON DELETE CASCADE,
  CONSTRAINT entry_org_class_fk FOREIGN KEY (organization_id,event_id,class_id) REFERENCES event_class(organization_id,event_id,id),
  CONSTRAINT entry_org_group_fk FOREIGN KEY (organization_id,event_id,registration_group_id,driver_person_id) REFERENCES registration_group(organization_id,event_id,id,person_id),
  CONSTRAINT entry_org_driver_fk FOREIGN KEY (organization_id,driver_person_id) REFERENCES person(organization_id,id),
  CONSTRAINT entry_org_vehicle_fk FOREIGN KEY (organization_id,vehicle_id) REFERENCES vehicle(organization_id,id),
  CONSTRAINT entry_verification_status_check CHECK (verification_status IN ('unverified','verified')),
  CONSTRAINT entry_acceptance_status_check CHECK (acceptance_status IN ('pending','accepted','rejected','waitlisted','withdrawn')),
  CONSTRAINT entry_deleted_reason_check CHECK (deleted_at IS NULL OR deletion_reason IS NOT NULL)
);
-- Requested numbers are held only by live, non-withdrawn entries; withdrawal/deletion releases the request.
CREATE UNIQUE INDEX entry_event_requested_start_number_unique ON entry(organization_id,event_id,requested_start_number)
  WHERE requested_start_number IS NOT NULL AND deleted_at IS NULL AND acceptance_status <> 'withdrawn';
CREATE TABLE entry_audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, entry_id uuid NOT NULL,
  transition text NOT NULL, from_status text NOT NULL, to_status text NOT NULL, actor text NOT NULL, reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_audit_transition_check CHECK (transition IN ('verification','acceptance')),
  CONSTRAINT entry_audit_actor_check CHECK (length(trim(actor)) > 0),
  CONSTRAINT entry_audit_reason_check CHECK (length(trim(reason)) > 0),
  CONSTRAINT entry_audit_org_entry_fk FOREIGN KEY (organization_id,entry_id) REFERENCES entry(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX entry_audit_entry_idx ON entry_audit_event(organization_id,entry_id,occurred_at);
