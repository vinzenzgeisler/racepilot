ALTER TABLE person ADD COLUMN country text;
ALTER TABLE person ADD CONSTRAINT person_country_code_check
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
