-- A withdrawn entry is a closed negative outcome. The old default stored it as "not_relevant",
-- which is the meaning of fields that do not apply and renders as a dash instead of "×".
UPDATE entry_workflow_revision
SET workflow = jsonb_set(
  workflow,
  '{statuses}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN status->>'category' = 'withdrawn' AND status->>'meaning' = 'not_relevant'
          THEN jsonb_set(status, '{meaning}', '"rejected"')
        ELSE status
      END
      ORDER BY position
    )
    FROM jsonb_array_elements(workflow->'statuses') WITH ORDINALITY AS item(status, position)
  )
)
WHERE jsonb_typeof(workflow->'statuses') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(workflow->'statuses') AS item(status)
    WHERE status->>'category' = 'withdrawn' AND status->>'meaning' = 'not_relevant'
  );
