CREATE TABLE entry_confirmation_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  registration_group_id uuid NOT NULL,
  object_id uuid NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_confirmation_document_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT entry_confirmation_document_org_object_unique UNIQUE (organization_id, object_id),
  CONSTRAINT entry_confirmation_document_group_fk FOREIGN KEY (organization_id, event_id, registration_group_id)
    REFERENCES registration_group (organization_id, event_id, id) ON DELETE CASCADE
);
CREATE INDEX entry_confirmation_document_group_idx
  ON entry_confirmation_document (organization_id, event_id, registration_group_id);
