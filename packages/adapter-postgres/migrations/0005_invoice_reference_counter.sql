CREATE TABLE invoice_reference_counter (
 organization_id uuid PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
 next_value integer NOT NULL CHECK (next_value > 0)
);
