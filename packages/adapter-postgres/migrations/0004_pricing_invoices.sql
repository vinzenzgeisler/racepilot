ALTER TABLE organization ADD COLUMN currency text NOT NULL DEFAULT 'EUR';
ALTER TABLE entry ADD COLUMN price_snapshot jsonb;
CREATE TABLE event_class_pricing_rule (
 organization_id uuid NOT NULL, event_id uuid NOT NULL, class_id uuid NOT NULL,
 base_cents integer NOT NULL CHECK (base_cents >= 0), additional_entry_adjustment_cents integer NOT NULL DEFAULT 0,
 early_bird_deadline timestamptz, early_bird_discount_cents integer NOT NULL DEFAULT 0 CHECK (early_bird_discount_cents >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT event_class_price_org_event_class_unique UNIQUE (organization_id,event_id,class_id),
 CONSTRAINT event_class_price_class_fk FOREIGN KEY (organization_id,event_id,class_id) REFERENCES event_class(organization_id,event_id,id) ON DELETE CASCADE
);
CREATE TABLE organization_payment_recipient (
 organization_id uuid PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
 account_name text NOT NULL, iban text NOT NULL, bic text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE invoice (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL, registration_group_id uuid NOT NULL,
 total_cents integer NOT NULL CHECK (total_cents >= 0), currency text NOT NULL, payment_reference text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partially_paid','paid','cancelled')), cancelled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT invoice_org_group_unique UNIQUE (organization_id,registration_group_id),
 CONSTRAINT invoice_org_reference_unique UNIQUE (organization_id,payment_reference),
 CONSTRAINT invoice_org_id_unique UNIQUE (organization_id,id),
 CONSTRAINT invoice_org_group_fk FOREIGN KEY (organization_id,event_id,registration_group_id) REFERENCES registration_group(organization_id,event_id,id) ON DELETE CASCADE
);
CREATE TABLE invoice_payment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, invoice_id uuid NOT NULL,
 amount_cents integer NOT NULL CHECK (amount_cents <> 0), reverses_payment_id uuid, actor text NOT NULL CHECK(length(trim(actor))>0), reason text NOT NULL CHECK(length(trim(reason))>0), occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT invoice_payment_org_id_unique UNIQUE (organization_id,id),
 CONSTRAINT invoice_payment_invoice_fk FOREIGN KEY (organization_id,invoice_id) REFERENCES invoice(organization_id,id) ON DELETE CASCADE,
 CONSTRAINT invoice_payment_reversal_fk FOREIGN KEY (organization_id,reverses_payment_id) REFERENCES invoice_payment(organization_id,id)
);
CREATE TABLE invoice_payment_audit_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, payment_id uuid NOT NULL, action text NOT NULL, actor text NOT NULL, reason text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT invoice_payment_audit_payment_fk FOREIGN KEY (organization_id,payment_id) REFERENCES invoice_payment(organization_id,id) ON DELETE CASCADE
);

CREATE FUNCTION prevent_entry_price_snapshot_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.price_snapshot IS NOT NULL AND NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot THEN
    RAISE EXCEPTION 'entry price snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.price_snapshot_version IS NOT NULL AND NEW.price_snapshot_version IS DISTINCT FROM OLD.price_snapshot_version THEN
    RAISE EXCEPTION 'entry price snapshot version is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER entry_price_snapshot_immutable
BEFORE UPDATE ON entry FOR EACH ROW EXECUTE FUNCTION prevent_entry_price_snapshot_change();
