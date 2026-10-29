-- Custom workflow statuses are stored as keys; acceptance status is validated by its pinned workflow.
ALTER TABLE entry DROP CONSTRAINT IF EXISTS entry_acceptance_status_check;
ALTER TABLE entry_audit_event ADD COLUMN status_category text;
