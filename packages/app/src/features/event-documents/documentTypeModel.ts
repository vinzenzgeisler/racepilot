import type { EntryDocumentType } from '@racepilot/contracts';

/** A document type as edited in the form; `saved` types keep their key for good. */
export type DocumentTypeDraft = {
  key: string;
  name: string;
  required: boolean;
  hint: string;
  saved: boolean;
  active: boolean;
};

export const ORGA_CODE_PREFIX = /^[A-Za-z0-9]{1,12}$/;
export const MAX_DOCUMENT_TYPES = 30;

export const draftFromType = (type: EntryDocumentType): DocumentTypeDraft => ({
  key: type.key,
  name: type.name,
  required: type.required,
  hint: type.hint ?? '',
  saved: true,
  active: type.enabled ?? true,
});

export const newDraft = (): DocumentTypeDraft => ({
  key: '',
  name: '',
  required: true,
  hint: '',
  saved: false,
  active: true,
});

function slug(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return /^[a-z]/.test(base) ? base : `dokument-${base}`.replace(/-$/, '');
}

/** Keys are derived once from the name and stay stable afterwards, so uploads keep their type. */
export function keyFor(name: string, taken: ReadonlySet<string>) {
  const base = slug(name);
  let key = base;
  for (let index = 2; taken.has(key); index += 1) key = `${base}-${index}`;
  return key;
}

export function documentTypeErrors(drafts: readonly DocumentTypeDraft[]) {
  const names = new Set<string>();
  return drafts.map((draft) => {
    if (!draft.active) return '';
    const name = draft.name.trim();
    if (!name) return 'Bitte einen Namen eingeben.';
    if (name.length > 120) return 'Der Name darf höchstens 120 Zeichen haben.';
    if (draft.hint.trim().length > 500)
      return 'Der Hinweis darf höchstens 500 Zeichen haben.';
    const normalized = name.toLowerCase();
    if (names.has(normalized)) return 'Dieser Name wird schon verwendet.';
    names.add(normalized);
    return '';
  });
}

export function toTypeRequest(
  drafts: readonly DocumentTypeDraft[],
): EntryDocumentType[] {
  const taken = new Set(drafts.filter((d) => d.saved).map((d) => d.key));
  return drafts
    .filter((draft) => draft.saved || draft.active)
    .map((draft) => {
      const key = draft.saved ? draft.key : keyFor(draft.name, taken);
      taken.add(key);
      return {
        key,
        name: draft.name.trim(),
        required: draft.required,
        enabled: draft.active,
        hint: draft.hint.trim() || null,
      };
    });
}

export const prefixError = (prefix: string) =>
  prefix && !ORGA_CODE_PREFIX.test(prefix)
    ? 'Höchstens 12 Zeichen, nur Buchstaben und Ziffern.'
    : '';
