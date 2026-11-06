-- Contact, emergency and publication data belong to one registration (event context), not to the
-- organization-wide person: a returning driver must not change other events' data silently.
-- Columns introduced in 0024 move over; values are carried only where the person has exactly one
-- registration, so nothing is copied into another event's registration.
ALTER TABLE registration_group
  ADD COLUMN phone text,
  ADD COLUMN street text,
  ADD COLUMN postal_code text,
  ADD COLUMN city text,
  ADD COLUMN emergency_contact_name text,
  ADD COLUMN emergency_contact_phone text,
  ADD COLUMN publication_preference text;
ALTER TABLE registration_group ADD CONSTRAINT registration_group_publication_preference_check
  CHECK (publication_preference IS NULL OR publication_preference IN ('name_visible','initials','hidden'));
UPDATE registration_group g
SET phone = p.phone,
    street = p.street,
    postal_code = p.postal_code,
    city = p.city,
    emergency_contact_name = p.emergency_contact_name,
    emergency_contact_phone = p.emergency_contact_phone,
    publication_preference = p.publication_preference
FROM person p
WHERE p.organization_id = g.organization_id
  AND p.id = g.person_id
  AND (p.phone IS NOT NULL OR p.street IS NOT NULL OR p.postal_code IS NOT NULL OR p.city IS NOT NULL
       OR p.emergency_contact_name IS NOT NULL OR p.emergency_contact_phone IS NOT NULL
       OR p.publication_preference IS NOT NULL)
  AND (SELECT count(*) FROM registration_group other
       WHERE other.organization_id = p.organization_id AND other.person_id = p.id) = 1;
ALTER TABLE person DROP CONSTRAINT person_publication_preference_check;
ALTER TABLE person
  DROP COLUMN phone,
  DROP COLUMN street,
  DROP COLUMN postal_code,
  DROP COLUMN city,
  DROP COLUMN emergency_contact_name,
  DROP COLUMN emergency_contact_phone,
  DROP COLUMN publication_preference;
-- Set when a shared vehicle was copied for the edited entry; other entries keep the original.
ALTER TABLE entry_data_audit_event ADD COLUMN copied_from_id uuid;
