ALTER TABLE entry ADD COLUMN revision integer NOT NULL DEFAULT 1;

CREATE TABLE entry_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  visibility text NOT NULL,
  body text NOT NULL,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_note_visibility_check CHECK (visibility IN ('internal','driver')),
  CONSTRAINT entry_note_body_check CHECK (length(trim(body)) > 0),
  CONSTRAINT entry_note_actor_check CHECK (length(trim(actor)) > 0),
  CONSTRAINT entry_note_entry_fk FOREIGN KEY (organization_id, entry_id)
    REFERENCES entry (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX entry_note_entry_idx ON entry_note (organization_id, entry_id, created_at);

CREATE TABLE entry_admin_action_audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  action text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  actor text NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_admin_action_name_check CHECK (action IN ('class_changed','amount_adjusted','deleted','restored')),
  CONSTRAINT entry_admin_action_actor_check CHECK (length(trim(actor)) > 0),
  CONSTRAINT entry_admin_action_reason_check CHECK (length(trim(reason)) > 0),
  CONSTRAINT entry_admin_action_entry_fk FOREIGN KEY (organization_id, entry_id)
    REFERENCES entry (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX entry_admin_action_entry_idx ON entry_admin_action_audit_event (organization_id, entry_id, occurred_at);

CREATE TABLE entry_amount_adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  original_cents integer NOT NULL,
  adjusted_cents integer NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_amount_adjustment_nonnegative CHECK (original_cents >= 0 AND adjusted_cents >= 0),
  CONSTRAINT entry_amount_adjustment_entry_fk FOREIGN KEY (organization_id, entry_id)
    REFERENCES entry (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX entry_amount_adjustment_entry_idx ON entry_amount_adjustment (organization_id, entry_id, occurred_at);

CREATE OR REPLACE FUNCTION prevent_entry_price_snapshot_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.price_snapshot IS NOT NULL AND NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot THEN
    IF NOT EXISTS (
      SELECT 1 FROM entry_admin_action_audit_event audit
      WHERE audit.organization_id = NEW.organization_id
        AND audit.entry_id = NEW.id
        AND audit.occurred_at = transaction_timestamp()
        AND (
          (audit.action = 'class_changed'
            AND audit.before_value->>'classId' = OLD.class_id::text
            AND audit.after_value->>'classId' = NEW.class_id::text)
          OR (audit.action = 'amount_adjusted'
            AND (audit.before_value->>'amountCents')::integer = (OLD.price_snapshot->>'totalCents')::integer
            AND (audit.after_value->>'amountCents')::integer = (NEW.price_snapshot->>'totalCents')::integer)
        )
    ) THEN
      RAISE EXCEPTION 'entry price snapshot is immutable without an audited admin action' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF OLD.price_snapshot_version IS NOT NULL AND NEW.price_snapshot_version IS DISTINCT FROM OLD.price_snapshot_version THEN
    IF NOT EXISTS (
      SELECT 1 FROM entry_admin_action_audit_event audit
      WHERE audit.organization_id = NEW.organization_id
        AND audit.entry_id = NEW.id
        AND audit.action = 'class_changed'
        AND audit.occurred_at = transaction_timestamp()
    ) THEN
      RAISE EXCEPTION 'entry price snapshot version is immutable without an audited class change' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE email_outbox
SET variables = variables || '{"driverNote":""}'::jsonb
WHERE template_key = 'status-change'
  AND status IN ('pending', 'sending')
  AND NOT variables ? 'driverNote';

-- Preserve immutable workflow revisions while adding the explicit reasoned return-to-open edge.
CREATE TEMP TABLE entry_workflow_reopen_upgrade ON COMMIT DROP AS
WITH scope_versions AS (
  SELECT organization_id, event_id, max(version) AS max_version
  FROM entry_workflow_revision
  GROUP BY organization_id, event_id
), ordered AS (
  SELECT
    revision.organization_id,
    revision.event_id,
    revision.id AS old_id,
    gen_random_uuid() AS new_id,
    (scope_versions.max_version + row_number() OVER (
      PARTITION BY revision.organization_id, revision.event_id
      ORDER BY revision.version, revision.id
    ))::integer AS new_version,
    jsonb_set(
      revision.workflow,
      '{transitions}',
      COALESCE(revision.workflow->'transitions', '[]'::jsonb) || COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'from', status->>'key',
          'to', 'pending',
          'reasonRequired', true,
          'permission', 'entry:write',
          'notify', true,
          'reopen', true
        ))
        FROM jsonb_array_elements(revision.workflow->'statuses') AS status
        WHERE status->>'key' <> 'pending'
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(revision.workflow->'transitions') AS edge
            WHERE edge->>'from' = status->>'key' AND edge->>'to' = 'pending'
          )
      ), '[]'::jsonb)
    ) AS workflow
  FROM entry_workflow_revision revision
  JOIN scope_versions
    ON scope_versions.organization_id = revision.organization_id
    AND scope_versions.event_id IS NOT DISTINCT FROM revision.event_id
)
SELECT * FROM ordered;

INSERT INTO entry_workflow_revision (
  organization_id, id, event_id, version, workflow, actor, reason
)
SELECT
  organization_id,
  new_id,
  event_id,
  new_version,
  workflow,
  'migration:0030',
  'Add audited reopen transitions'
FROM entry_workflow_reopen_upgrade;

UPDATE entry
SET workflow_revision_id = upgrade.new_id
FROM entry_workflow_reopen_upgrade upgrade
WHERE entry.organization_id = upgrade.organization_id
  AND entry.workflow_revision_id = upgrade.old_id;

UPDATE entry_workflow_current
SET workflow_revision_id = upgrade.new_id
FROM entry_workflow_reopen_upgrade upgrade
WHERE entry_workflow_current.organization_id = upgrade.organization_id
  AND entry_workflow_current.workflow_revision_id = upgrade.old_id;

INSERT INTO entry_workflow_audit (
  organization_id, event_id, workflow_revision_id, actor, reason
)
SELECT
  organization_id,
  event_id,
  new_id,
  'migration:0030',
  'Add audited reopen transitions'
FROM entry_workflow_reopen_upgrade;

CREATE FUNCTION add_reopen_edges_to_initial_organization_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE entry_workflow_revision revision
  SET workflow = jsonb_set(
    revision.workflow,
    '{transitions}',
    COALESCE(revision.workflow->'transitions', '[]'::jsonb) || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'from', status->>'key',
        'to', 'pending',
        'reasonRequired', true,
        'permission', 'entry:write',
        'notify', true,
        'reopen', true
      ))
      FROM jsonb_array_elements(revision.workflow->'statuses') AS status
      WHERE status->>'key' <> 'pending'
    ), '[]'::jsonb)
  )
  WHERE revision.organization_id = NEW.id
    AND revision.event_id IS NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER organization_entry_workflow_reopen
  AFTER INSERT ON organization
  FOR EACH ROW EXECUTE FUNCTION add_reopen_edges_to_initial_organization_workflow();
