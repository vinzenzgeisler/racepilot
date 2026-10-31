ALTER TABLE registration_group
  ADD COLUMN custom_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT registration_group_custom_answers_object_check
    CHECK (jsonb_typeof(custom_answers) = 'object');

CREATE TABLE registration_form_upload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  registration_group_id uuid,
  field_key text NOT NULL,
  object_id uuid NOT NULL,
  upload_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registration_form_upload_org_object_unique UNIQUE (organization_id, object_id),
  CONSTRAINT registration_form_upload_event_fk
    FOREIGN KEY (organization_id,event_id) REFERENCES event(organization_id,id) ON DELETE CASCADE,
  CONSTRAINT registration_form_upload_group_fk
    FOREIGN KEY (organization_id,event_id,registration_group_id)
    REFERENCES registration_group(organization_id,event_id,id) ON DELETE CASCADE,
  CONSTRAINT registration_form_upload_field_key_check
    CHECK (field_key ~ '^[a-z][a-z0-9_-]{0,39}$'),
  CONSTRAINT registration_form_upload_token_hash_check
    CHECK (upload_token_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX registration_form_upload_scope_idx
  ON registration_form_upload(organization_id,event_id,field_key,expires_at);
