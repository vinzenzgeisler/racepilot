ALTER TABLE email_outbox ADD COLUMN registration_group_id uuid;
ALTER TABLE email_outbox
  ADD CONSTRAINT email_outbox_org_event_group_fk
  FOREIGN KEY (organization_id, event_id, registration_group_id)
  REFERENCES registration_group (organization_id, event_id, id);
CREATE INDEX email_outbox_registration_group_idx
  ON email_outbox (organization_id, event_id, registration_group_id)
  WHERE registration_group_id IS NOT NULL;
