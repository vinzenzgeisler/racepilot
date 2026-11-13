export type RegistrationUnavailableReason =
  | 'event-unavailable'
  | 'registration-closed'
  | 'submission-in-progress'
  | 'custom-field-unknown'
  | 'multiple-entries-disabled'
  | 'requested-start-number-hidden'
  | 'organization-unavailable'
  | 'terms-mismatch'
  | 'terms-required'
  | 'prior-group'
  | 'class-price-missing'
  | 'upload-missing'
  | 'required-answer'
  | 'invalid-answer'
  | 'invalid-participant'
  | 'age-restricted'
  | 'guardian-required'
  | 'too-many-classes'
  | 'class-unavailable'
  | 'capacity-exceeded'
  | 'shared-email-disallowed'
  | 'draft-field-unknown'
  | 'draft-upload-invalid'
  | 'origin-unavailable';

export class RegistrationUnavailable extends Error {
  constructor(readonly reason: RegistrationUnavailableReason) {
    super('Registration unavailable');
    this.name = 'RegistrationUnavailable';
  }
}
