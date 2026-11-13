import type { AdminEntryDetails } from '@racepilot/core';

export interface CustomAnswerGroup {
  id: string;
  eventId: string;
  customAnswers: Record<string, string | boolean | { objectId: string }> | null;
  eventConfig: unknown;
  organizationConfig: unknown;
  locale: string;
}

/**
 * The registration's free-form answers with the label of their field; an uploaded file is only
 * offered for download while the upload was actually consumed by this registration.
 */
export function customAnswersFor(
  item: { registrationGroupId: string; eventId: string },
  group: CustomAnswerGroup | undefined,
  uploadKeys: ReadonlySet<string>,
): AdminEntryDetails['customAnswers'] {
  if (!group || group.eventId !== item.eventId) return [];
  const eventConfig = group.eventConfig as Record<string, unknown> | null;
  const organizationConfig = group.organizationConfig as Record<
    string,
    unknown
  > | null;
  const fieldSource =
    eventConfig?.customFields ?? organizationConfig?.customFields;
  const fields = Array.isArray(fieldSource) ? fieldSource : [];
  const fieldByKey = new Map(
    fields.flatMap((field) => {
      if (!field || typeof field !== 'object') return [];
      const candidate = field as {
        key?: unknown;
        label?: { de?: unknown; en?: unknown };
        type?: unknown;
      };
      if (typeof candidate.key !== 'string') return [];
      return [[candidate.key, candidate] as const];
    }),
  );
  const answers = group.customAnswers ?? {};
  const locale = group.locale.toLowerCase().startsWith('en') ? 'en' : 'de';
  return Object.entries(answers).map(([key, answer]) => {
    const field = fieldByKey.get(key);
    if (
      answer &&
      typeof answer === 'object' &&
      !Array.isArray(answer) &&
      typeof answer.objectId === 'string' &&
      uploadKeys.has(`${group.id}:${group.eventId}:${key}:${answer.objectId}`)
    ) {
      return {
        key,
        label:
          typeof field?.label?.[locale] === 'string'
            ? field.label[locale]
            : key,
        value: null,
        fileDownloadUrl: `/admin/events/${group.eventId}/registration-form-uploads/${answer.objectId}`,
      };
    }
    if (typeof answer === 'string' || typeof answer === 'boolean')
      return {
        key,
        label:
          typeof field?.label?.[locale] === 'string'
            ? field.label[locale]
            : key,
        value: answer,
        fileDownloadUrl: null,
      };
    return {
      key,
      label:
        typeof field?.label?.[locale] === 'string' ? field.label[locale] : key,
      value: null,
      fileDownloadUrl: null,
    };
  });
}
