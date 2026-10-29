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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  FOREIGN KEY (organization_id, event_id, workflow_revision_id)
    REFERENCES entry_workflow_revision(organization_id, event_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX entry_workflow_current_scope_unique
  ON entry_workflow_current(organization_id, COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::uuid));
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
  '{"version":1,"statuses":[{"key":"pending","labels":{"de":"Ausstehend","en":"Pending"},"color":"#64748b","category":"pending"},{"key":"accepted","labels":{"de":"Angenommen","en":"Accepted"},"color":"#15803d","category":"accepted"},{"key":"rejected","labels":{"de":"Abgelehnt","en":"Rejected"},"color":"#b91c1c","category":"rejected"},{"key":"waitlisted","labels":{"de":"Warteliste","en":"Waitlisted"},"color":"#a16207","category":"waitlisted"},{"key":"withdrawn","labels":{"de":"Zurückgezogen","en":"Withdrawn"},"color":"#475569","category":"withdrawn"}],"transitions":[{"from":"pending","to":"accepted","reasonRequired":false},{"from":"pending","to":"rejected","reasonRequired":false},{"from":"pending","to":"waitlisted","reasonRequired":false},{"from":"pending","to":"withdrawn","reasonRequired":false},{"from":"accepted","to":"withdrawn","reasonRequired":false},{"from":"rejected","to":"withdrawn","reasonRequired":false},{"from":"waitlisted","to":"accepted","reasonRequired":false},{"from":"waitlisted","to":"rejected","reasonRequired":false},{"from":"waitlisted","to":"withdrawn","reasonRequired":false}]}'::jsonb,
  'migration:0012', 'Preserve legacy workflow'
FROM organization o;
INSERT INTO entry_workflow_revision(organization_id, event_id, version, workflow, actor, reason)
SELECT e.organization_id, e.id, 1, r.workflow, 'migration:0012', 'Preserve legacy event workflow'
FROM event e JOIN entry_workflow_revision r ON r.organization_id = e.organization_id AND r.event_id IS NULL;
INSERT INTO entry_workflow_current(organization_id, event_id, workflow_revision_id)
SELECT organization_id, event_id, id FROM entry_workflow_revision;
UPDATE entry e SET workflow_revision_id = r.id
FROM entry_workflow_revision r WHERE r.organization_id = e.organization_id AND r.event_id = e.event_id;
CREATE FUNCTION create_organization_entry_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_id uuid;
BEGIN
  INSERT INTO entry_workflow_revision(organization_id, event_id, version, workflow, actor, reason)
  VALUES (NEW.id, NULL, 1,
    '{"version":1,"statuses":[{"key":"pending","labels":{"de":"Ausstehend","en":"Pending"},"color":"#64748b","category":"pending"},{"key":"accepted","labels":{"de":"Angenommen","en":"Accepted"},"color":"#15803d","category":"accepted"},{"key":"rejected","labels":{"de":"Abgelehnt","en":"Rejected"},"color":"#b91c1c","category":"rejected"},{"key":"waitlisted","labels":{"de":"Warteliste","en":"Waitlisted"},"color":"#a16207","category":"waitlisted"},{"key":"withdrawn","labels":{"de":"Zurückgezogen","en":"Withdrawn"},"color":"#475569","category":"withdrawn"}],"transitions":[{"from":"pending","to":"accepted","reasonRequired":false},{"from":"pending","to":"rejected","reasonRequired":false},{"from":"pending","to":"waitlisted","reasonRequired":false},{"from":"pending","to":"withdrawn","reasonRequired":false},{"from":"accepted","to":"withdrawn","reasonRequired":false},{"from":"rejected","to":"withdrawn","reasonRequired":false},{"from":"waitlisted","to":"accepted","reasonRequired":false},{"from":"waitlisted","to":"rejected","reasonRequired":false},{"from":"waitlisted","to":"withdrawn","reasonRequired":false}]}'::jsonb,
    'system:organization-create', 'Initialize default entry workflow')
  RETURNING id INTO revision_id;
  INSERT INTO entry_workflow_current(organization_id, event_id, workflow_revision_id)
  VALUES (NEW.id, NULL, revision_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER organization_entry_workflow_default
  AFTER INSERT ON organization FOR EACH ROW EXECUTE FUNCTION create_organization_entry_workflow();
CREATE FUNCTION create_event_entry_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_workflow jsonb; revision_id uuid;
BEGIN
  SELECT r.workflow INTO source_workflow
  FROM entry_workflow_current c JOIN entry_workflow_revision r
    ON r.organization_id = c.organization_id AND r.id = c.workflow_revision_id
  WHERE c.organization_id = NEW.organization_id AND c.event_id IS NULL;
  IF source_workflow IS NULL THEN RAISE EXCEPTION 'No organization entry workflow configured'; END IF;
  INSERT INTO entry_workflow_revision(organization_id, event_id, version, workflow, actor, reason)
  VALUES (NEW.organization_id, NEW.id, 1, source_workflow,
    'system:event-create', 'Copy organization default workflow') RETURNING id INTO revision_id;
  INSERT INTO entry_workflow_current(organization_id, event_id, workflow_revision_id)
  VALUES (NEW.organization_id, NEW.id, revision_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER event_entry_workflow_default
  AFTER INSERT ON event FOR EACH ROW EXECUTE FUNCTION create_event_entry_workflow();
CREATE FUNCTION pin_entry_workflow_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workflow_revision_id IS NULL THEN
    SELECT workflow_revision_id INTO NEW.workflow_revision_id
    FROM entry_workflow_current
    WHERE organization_id = NEW.organization_id AND event_id = NEW.event_id;
    IF NEW.workflow_revision_id IS NULL THEN
      SELECT workflow_revision_id INTO NEW.workflow_revision_id
      FROM entry_workflow_current
      WHERE organization_id = NEW.organization_id AND event_id IS NULL;
    END IF;
  END IF;
  IF NEW.workflow_revision_id IS NULL THEN
    RAISE EXCEPTION 'No entry workflow configured for organization % event %', NEW.organization_id, NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER entry_pin_workflow_revision
  BEFORE INSERT ON entry FOR EACH ROW EXECUTE FUNCTION pin_entry_workflow_revision();
ALTER TABLE entry ALTER COLUMN workflow_revision_id SET NOT NULL;
ALTER TABLE entry ADD CONSTRAINT entry_workflow_revision_fk FOREIGN KEY (organization_id, event_id, workflow_revision_id)
  REFERENCES entry_workflow_revision(organization_id, event_id, id);
-- Every legacy event receives a version-1 copy of its organization default; existing entries stay pinned to it.
ALTER TABLE entry_audit_event ADD COLUMN workflow_revision_id uuid;
UPDATE entry_audit_event a SET workflow_revision_id = e.workflow_revision_id
FROM entry e WHERE e.organization_id = a.organization_id AND e.id = a.entry_id;
CREATE FUNCTION pin_entry_audit_workflow_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workflow_revision_id IS NULL THEN
    SELECT workflow_revision_id INTO NEW.workflow_revision_id FROM entry
    WHERE organization_id = NEW.organization_id AND id = NEW.entry_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER entry_audit_pin_workflow_revision
  BEFORE INSERT ON entry_audit_event FOR EACH ROW EXECUTE FUNCTION pin_entry_audit_workflow_revision();
ALTER TABLE entry_audit_event ALTER COLUMN workflow_revision_id SET NOT NULL;
ALTER TABLE entry_audit_event ADD CONSTRAINT entry_audit_workflow_revision_fk
  FOREIGN KEY (organization_id, workflow_revision_id)
  REFERENCES entry_workflow_revision(organization_id, id);
