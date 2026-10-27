ALTER TABLE event ADD COLUMN registration_opens_at timestamptz;
ALTER TABLE event ADD COLUMN registration_closes_at timestamptz;
ALTER TABLE event ADD COLUMN opened_at timestamptz;
ALTER TABLE event ADD COLUMN closed_at timestamptz;
ALTER TABLE event ADD COLUMN archived_at timestamptz;
CREATE TABLE event_class (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL,
 name text NOT NULL, code text NOT NULL, vehicle_type text NOT NULL,
 sort_order integer NOT NULL DEFAULT 0, max_participants integer, closed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT event_class_org_event_fk FOREIGN KEY (organization_id,event_id) REFERENCES event(organization_id,id) ON DELETE CASCADE,
 CONSTRAINT event_class_org_event_id_unique UNIQUE (organization_id,event_id,id),
 CONSTRAINT event_class_org_event_code_unique UNIQUE (organization_id,event_id,code),
 CONSTRAINT event_class_vehicle_type_check CHECK (vehicle_type IN ('car','motorcycle','kart','other')),
 CONSTRAINT event_class_sort_order_check CHECK (sort_order >= 0),
 CONSTRAINT event_class_max_participants_check CHECK (max_participants IS NULL OR max_participants > 0)
);
