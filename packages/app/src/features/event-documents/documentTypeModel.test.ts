import { describe, expect, it } from 'vitest';
import {
  documentTypeErrors,
  draftFromType,
  newDraft,
  toTypeRequest,
  prefixError,
} from './documentTypeModel.js';

describe('event document settings', () => {
  it('saves stable keys and persists deactivated types', () => {
    const active = draftFromType({
      key: 'fahrerlizenz',
      name: 'Fahrerlizenz',
      required: true,
      hint: null,
    });
    const inactive = {
      ...draftFromType({
        key: 'fahrzeugschein',
        name: 'Fahrzeugschein',
        required: true,
        hint: null,
      }),
      active: false,
    };
    const added = {
      ...newDraft(),
      name: 'Ärztliches Attest',
      required: false,
      hint: 'Bei Bedarf',
    };
    expect(toTypeRequest([active, inactive, added])).toEqual([
      {
        key: 'fahrerlizenz',
        name: 'Fahrerlizenz',
        required: true,
        enabled: true,
        hint: null,
      },
      {
        key: 'fahrzeugschein',
        name: 'Fahrzeugschein',
        required: true,
        enabled: false,
        hint: null,
      },
      {
        key: 'arztliches-attest',
        name: 'Ärztliches Attest',
        required: false,
        enabled: true,
        hint: 'Bei Bedarf',
      },
    ]);
  });
  it('validates active names and allows inactive drafts to be omitted', () => {
    expect(
      documentTypeErrors([
        { ...newDraft(), name: 'Lizenz' },
        { ...newDraft(), name: 'lizenz' },
      ])[1],
    ).toMatch(/schon verwendet/);
    expect(
      documentTypeErrors([{ ...newDraft(), name: '', active: false }]),
    ).toEqual(['']);
    expect(prefixError('ABC-1')).toMatch(/Buchstaben/);
    expect(prefixError('BERG2027')).toBe('');
  });
});
