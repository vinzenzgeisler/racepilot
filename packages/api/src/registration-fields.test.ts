import { describe, expect, it } from 'vitest';
import {
  defaultRegistrationFormConfig,
  PublicRegistrationRequestSchema,
  RegistrationContactFieldsSchema,
  RegistrationFormConfigPatchSchema,
  RegistrationFormConfigSchema,
} from '@racepilot/contracts';
import {
  registrationDetailFieldKeys,
  resolveRegistrationFieldStates,
} from '@racepilot/core';

const request = (person: object = {}, vehicle: object = {}) => ({
  submissionId: '11111111-1111-4111-8111-111111111111',
  formVersion: '1.0',
  language: 'de',
  eventSlug: 'demo',
  person: {
    firstName: 'Anna',
    lastName: 'Rennfahrerin',
    email: 'anna@example.test',
    dateOfBirth: '1990-05-05',
    ...person,
  },
  entries: [
    {
      classId: '22222222-2222-4222-8222-222222222222',
      vehicle: {
        make: 'NSU',
        model: 'TT',
        year: 1969,
        registration: null,
        ...vehicle,
      },
    },
  ],
  consents: [
    { key: 'terms', version: '1', hash: 'a'.repeat(64), accepted: true },
  ],
});

describe('registration field configuration', () => {
  it('keeps the server defaults and the delivered form defaults identical', () => {
    const states = resolveRegistrationFieldStates(null, null);
    for (const key of registrationDetailFieldKeys)
      expect(states[key], key).toBe(
        defaultRegistrationFormConfig.fields[key].state,
      );
  });

  it('accepts configurations stored before the newer fields existed', () => {
    const { publicationPreference: _removed, ...older } =
      defaultRegistrationFormConfig.fields;
    void _removed;
    const parsed = RegistrationFormConfigSchema.parse({
      ...defaultRegistrationFormConfig,
      fields: older,
    });
    expect(parsed.fields.publicationPreference.state).toBe('optional');
    // An event overrides single fields without restating all of them.
    expect(
      RegistrationFormConfigPatchSchema.safeParse({
        fields: { phone: { state: 'required' } },
      }).success,
    ).toBe(true);
  });

  it('normalizes, bounds and rejects public contact and vehicle input', () => {
    const valid = PublicRegistrationRequestSchema.parse(
      request(
        {
          phone: ' +49 351 123456 ',
          city: '',
          emergencyContactName: 'Bernd',
          emergencyContactPhone: '+49 351 654321',
        },
        { displacementCc: 1177, cylinders: 4, history: '  Neuaufbau ' },
      ),
    );
    expect(valid.person).toMatchObject({ phone: '+49 351 123456', city: null });
    expect(valid.entries[0]!.vehicle.history).toBe('Neuaufbau');
    for (const bad of [
      request({ phone: 'abc' }),
      request({ postalCode: '!!' }),
      request({ publicationPreference: 'everyone' }),
      request({}, { cylinders: 99 }),
      request({}, { displacementCc: 0 }),
      request({}, { history: 'x'.repeat(4001) }),
      request({ vehicleType: 'car' }),
    ])
      expect(PublicRegistrationRequestSchema.safeParse(bad).success).toBe(
        false,
      );
  });
});

describe('shared emergency contact schema', () => {
  it('accepts both fields or neither and rejects either incomplete direction', () => {
    expect(RegistrationContactFieldsSchema.safeParse({}).success).toBe(true);
    expect(
      RegistrationContactFieldsSchema.safeParse({
        emergencyContactName: 'Anna',
        emergencyContactPhone: '+49 12345',
      }).success,
    ).toBe(true);
    expect(
      RegistrationContactFieldsSchema.safeParse({
        emergencyContactName: 'Anna',
      }).success,
    ).toBe(false);
    expect(
      RegistrationContactFieldsSchema.safeParse({
        emergencyContactPhone: '+49 12345',
      }).success,
    ).toBe(false);
    expect(
      PublicRegistrationRequestSchema.safeParse(
        request({ emergencyContactPhone: '+49 12345' }),
      ).success,
    ).toBe(false);
  });
});
