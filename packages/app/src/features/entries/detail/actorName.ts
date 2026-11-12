export function actorName(actor: string) {
  if (actor === 'System') return 'System';
  if (
    /https?:\/\//i.test(actor) ||
    /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(actor)
  )
    return 'Veranstalter';
  return actor;
}
