CREATE TABLE "organization_membership" (
	"organization_id" uuid NOT NULL,
	"user_identity_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_membership_org_identity_unique" UNIQUE("organization_id","user_identity_id"),
	CONSTRAINT "organization_membership_role_check" CHECK ("organization_membership"."role" in ('admin','member')),
	CONSTRAINT "organization_membership_status_check" CHECK ("organization_membership"."status" in ('active','disabled'))
);
--> statement-breakpoint
CREATE TABLE "user_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identity_issuer_subject_unique" UNIQUE("issuer","subject")
);
--> statement-breakpoint
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_user_identity_id_user_identity_id_fk" FOREIGN KEY ("user_identity_id") REFERENCES "public"."user_identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_membership_identity_idx" ON "organization_membership" USING btree ("user_identity_id");