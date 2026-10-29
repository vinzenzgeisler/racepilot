-- Immutable, tenant-scoped workflow revisions. Event revisions override organization defaults.
CREATE TABLE entry_workflow_revision (
  organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid,
  version integer NOT NULL CHECK (version >= 1),
  workflow jsonb NOT NULL CHECK (jsonb_typeof(workflow) = 'object'),
  actor text NOT NULL CHECK (length(trim(actor)) > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, event_id, version),
  UNIQUE (organization_id, event_id, id),
  FOREIGN KEY (organization_id, event_id) REFERENCES event(organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX entry_workflow_org_version_unique ON entry_workflow_revision(organization_id, version) WHERE event_id IS NULL;
CREATE TABLE entry_workflow_current (
  organization_id uuid NOT NULL,
  event_id uuid,
  workflow_revision_id uuid NOT NULL,
  PRIMARY KEY (organization_id, event_id),
  FOREIGN KEY (organization_id, event_id, workflow_revision_id)
    REFERENCES entry_workflow_revision(organization_id, event_id, id) ON DELETE CASCADE
);
CREATE TABLE entry_workflow_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_id uuid,
  workflow_revision_id uuid NOT NULL,
  actor text NOT NULL CHECK (length(trim(actor)) > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, event_id, workflow_revision_id)
    REFERENCES entry_workflow_revision(organization_id, event_id, id) ON DELETE CASCADE
);
ALTER TABLE entry DROP CONSTRAINT entry_acceptance_status_check;
ALTER TABLE entry ADD COLUMN workflow_revision_id uuid;
-- Existing entries point to the immutable organization default, retaining their current status keys.
INSERT INTO entry_workflow_revision(organization_id, event_id, version, workflow, actor, reason)
SELECT o.id, NULL, 1,
  '{"version":1,"statuses":[{"key":"pending","label":{"de":"Ausstehend","en":"Pending"},"color":"#d97706","category":"pending"},{"key":"accepted","label":{"de":"Angenommen","en":"Accepted"},"color":"#15803d","category":"accepted"},{"key":"rejected","label":{"de":"Abgelehnt","en":"Rejected"},"color":"#b91c1c","category":"rejected"},{"key":"waitlisted","label":{"de":"Warteliste","en":"Waitlisted"},"color":"#0369a1","category":"waitlisted"},{"key":"withdrawn","label":{"de":"Zurückgezogen","en":"Withdrawn"},"color":"#64748b","category":"withdrawn"}],"transitions":[{"from":"pending","to":"accepted","reasonRequired":false},{"from":"pending","to":"rejected","reasonRequired":false},{"from":"pending","to":"waitlisted","reasonRequired":false},{"from":"pending","to":"withdrawn","reasonRequired":false},{"from":"accepted","to":"withdrawn","reasonRequired":false},{"from":"rejected","to":"withdrawn","reasonRequired":false},{"from":"waitlisted","to":"accepted","reasonRequired":false},{"from":"waitlisted","to":"rejected","reasonRequired":false},{"from":"waitlisted","to":"withdrawn","reasonRequired":false}]}'::jsonb,
  'migration:0012', 'Preserve legacy workflow'
FROM organization o;
INSERT INTO entry_workflow_revision(organization_id, event_id, version, workflow, actor, reason)
SELECT e.organization_id, e.id, 1, r.workflow, 'migration:0012', 'Preserve legacy event workflow'
FROM event e JOIN entry_workflow_revision r ON r.organization_id = e.organization_id AND r.event_id IS NULL;
INSERT INTO entry_workflow_current(organization_id, event_id, workflow_revision_id)
SELECT organization_id, event_id, id FROM entry_workflow_revision;
UPDATE entry e SET workflow_revision_id = r.id
FROM entry_workflow_revision r WHERE r.organization_id = e.organization_id AND r.event_id = e.event_id;
ALTER TABLE entry ALTER COLUMN workflow_revision_id SET NOT NULL;
ALTER TABLE entry ADD CONSTRAINT entry_workflow_revision_fk FOREIGN KEY (organization_id, event_id, workflow_revision_id)
  REFERENCES entry_workflow_revision(organization_id, event_id, id);
-- Every legacy event receives a version-1 copy of its organization default; existing entries stay pinned to it.
