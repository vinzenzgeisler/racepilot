ALTER TABLE event ADD COLUMN orga_code_prefix text;
ALTER TABLE entry ADD COLUMN orga_code text;

ALTER TABLE event ADD CONSTRAINT event_orga_code_prefix_check CHECK (orga_code_prefix IS NULL OR orga_code_prefix ~ '^[A-Z0-9]{1,12}$');

CREATE TABLE event_orga_code_sequence (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  last_number bigint NOT NULL CHECK (last_number >= 0),
  PRIMARY KEY (organization_id, event_id),
  FOREIGN KEY (organization_id, event_id) REFERENCES event (organization_id, id) ON DELETE CASCADE
);

CREATE FUNCTION entry_org_code_base36(input_value bigint) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; value bigint := input_value; output text := '';
BEGIN
  WHILE value > 0 LOOP output := substr(alphabet, (value % 36)::integer + 1, 1) || output; value := value / 36; END LOOP;
  RETURN COALESCE(NULLIF(output, ''), '0');
END $$;
WITH numbered AS (
  SELECT e.id, e.organization_id, e.event_id,
    COALESCE(NULLIF(upper(trim(ev.orga_code_prefix)), ''), NULLIF(left(regexp_replace(upper(ev.slug), '[^A-Z0-9]', '', 'g'), 8), ''), 'NEN') || '-' ||
    lpad(entry_org_code_base36(row_number() OVER (PARTITION BY e.organization_id, e.event_id ORDER BY e.created_at, e.id)), 5, '0') AS code,
    row_number() OVER (PARTITION BY e.organization_id, e.event_id ORDER BY e.created_at, e.id) AS sequence
  FROM entry e JOIN event ev ON ev.organization_id=e.organization_id AND ev.id=e.event_id
)
UPDATE entry e SET orga_code=n.code FROM numbered n WHERE e.id=n.id;
ALTER TABLE entry ALTER COLUMN orga_code SET NOT NULL;
INSERT INTO event_orga_code_sequence (organization_id, event_id, last_number)
SELECT organization_id, event_id, max(sequence) FROM (
 SELECT organization_id,event_id,row_number() OVER (PARTITION BY organization_id,event_id ORDER BY created_at,id) AS sequence FROM entry
) numbers GROUP BY organization_id,event_id
ON CONFLICT (organization_id,event_id) DO UPDATE SET last_number=excluded.last_number;
ALTER TABLE entry ADD CONSTRAINT entry_org_event_orga_code_unique UNIQUE (organization_id,event_id,orga_code);
DROP FUNCTION entry_org_code_base36(bigint);
CREATE INDEX entry_orga_code_search_idx ON entry (organization_id,orga_code);

CREATE TABLE event_entry_document_type (
  organization_id uuid NOT NULL, event_id uuid NOT NULL, key text NOT NULL, name text NOT NULL, required boolean NOT NULL, hint text, enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,event_id,key), FOREIGN KEY (organization_id,event_id) REFERENCES event (organization_id,id) ON DELETE CASCADE,
  CHECK (key ~ '^[a-z][a-z0-9_-]{0,63}$'), CHECK (length(trim(name)) BETWEEN 1 AND 120), CHECK (hint IS NULL OR length(hint) <= 500)
);
CREATE TABLE entry_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL, entry_id uuid NOT NULL, type_key text NOT NULL, object_id uuid NOT NULL,
  file_name text NOT NULL, content_type text NOT NULL, size integer NOT NULL, sha256 text NOT NULL, status text NOT NULL DEFAULT 'uploaded', uploaded_at timestamptz NOT NULL DEFAULT now(), uploaded_by text NOT NULL,
  reviewed_at timestamptz, reviewed_by text, rejection_reason text,
  FOREIGN KEY (organization_id,event_id,entry_id) REFERENCES entry (organization_id,event_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,event_id,type_key) REFERENCES event_entry_document_type (organization_id,event_id,key),
  CHECK (status IN ('uploaded','reviewed','rejected')), CHECK (size BETWEEN 1 AND 10485760), UNIQUE (organization_id,event_id,entry_id,id),
  CHECK (content_type IN ('application/pdf','image/jpeg','image/png')), CHECK (length(trim(file_name)) BETWEEN 1 AND 255), CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  CHECK ((status='uploaded' AND reviewed_at IS NULL AND reviewed_by IS NULL AND rejection_reason IS NULL) OR (status='reviewed' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND rejection_reason IS NULL) OR (status='rejected' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND length(trim(rejection_reason)) > 0))
);
CREATE INDEX entry_document_entry_type_uploaded_idx ON entry_document (organization_id,entry_id,type_key,uploaded_at DESC);
CREATE INDEX entry_document_object_idx ON entry_document (organization_id,object_id);
CREATE TABLE entry_document_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL, entry_id uuid NOT NULL, document_id uuid NOT NULL, from_status text NOT NULL, to_status text NOT NULL, actor text NOT NULL, reason text, occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,event_id,entry_id) REFERENCES entry (organization_id,event_id,id) ON DELETE CASCADE, FOREIGN KEY (organization_id,event_id,entry_id,document_id) REFERENCES entry_document (organization_id,event_id,entry_id,id) ON DELETE CASCADE, CHECK (actor <> ''), CHECK (from_status IN ('uploaded','reviewed','rejected')), CHECK (to_status IN ('reviewed','rejected'))
);
CREATE INDEX entry_document_audit_entry_idx ON entry_document_audit (organization_id,entry_id,occurred_at);
