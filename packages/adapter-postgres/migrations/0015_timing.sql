ALTER TABLE entry
  ADD CONSTRAINT entry_org_event_id_unique UNIQUE (organization_id, event_id, id);

CREATE TABLE timing_measurement (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  run integer NOT NULL CHECK (run > 0),
  time_ms integer NOT NULL CHECK (time_ms > 0),
  penalty_ms integer NOT NULL DEFAULT 0 CHECK (penalty_ms >= 0),
  exclusion text CHECK (exclusion IN ('DNF','DNS','DSQ')),
  source text NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 200),
  recorded_at timestamptz NOT NULL,
  recorded_by text NOT NULL CHECK (length(trim(recorded_by)) > 0),
  version integer NOT NULL CHECK (version > 0),
  supersedes_id uuid,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (organization_id, event_id, id),
  UNIQUE (organization_id, event_id, entry_id, run, version),
  FOREIGN KEY (organization_id, event_id)
    REFERENCES event(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, entry_id)
    REFERENCES entry(organization_id, event_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, supersedes_id)
    REFERENCES timing_measurement(organization_id, event_id, id)
);
CREATE UNIQUE INDEX timing_measurement_one_active_run
  ON timing_measurement(organization_id, event_id, entry_id, run) WHERE active;
CREATE INDEX timing_measurement_event_idx
  ON timing_measurement(organization_id, event_id, entry_id, run);

CREATE TABLE timing_result_version (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft','published')),
  rule jsonb NOT NULL CHECK (jsonb_typeof(rule) = 'object'),
  results jsonb NOT NULL CHECK (jsonb_typeof(results) = 'array'),
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  PRIMARY KEY (organization_id, event_id, version),
  FOREIGN KEY (organization_id, event_id)
    REFERENCES event(organization_id, id) ON DELETE CASCADE,
  CHECK ((status = 'draft' AND published_at IS NULL) OR
         (status = 'published' AND published_at IS NOT NULL))
);
CREATE INDEX timing_result_publication_idx
  ON timing_result_version(organization_id, event_id, version DESC)
  WHERE status = 'published';

CREATE TABLE timing_audit (
  organization_id uuid NOT NULL,
  event_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  measurement_id uuid,
  result_version integer,
  action text NOT NULL CHECK (action IN ('record','correct','draft','publish')),
  actor text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, event_id, id),
  FOREIGN KEY (organization_id, event_id)
    REFERENCES event(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, measurement_id)
    REFERENCES timing_measurement(organization_id, event_id, id),
  FOREIGN KEY (organization_id, event_id, result_version)
    REFERENCES timing_result_version(organization_id, event_id, version)
);
