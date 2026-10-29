ALTER TABLE email_template_version DROP CONSTRAINT email_template_version_key_check;
ALTER TABLE email_template_version ADD CONSTRAINT email_template_version_key_check
  CHECK (template_key IN ('verification','entry-received','accepted','rejected','status-change'));
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_key_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_key_check
  CHECK (template_key IN ('verification','entry-received','accepted','rejected','status-change'));
