ALTER TABLE email_outbox
  ADD COLUMN attachment_refs jsonb NOT NULL DEFAULT '[]'::jsonb;
