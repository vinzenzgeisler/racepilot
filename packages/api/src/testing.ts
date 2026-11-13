import { silentLogger } from '@racepilot/core';
import {
  createInMemoryRegistrationRateLimiter,
  type RegistrationRateLimiter,
} from './rate-limit.js';
import type { PublicRegistrationService } from './services.js';
import type {
  ApiDeps,
  CoreApiDeps,
  PublicRegistrationModule,
} from './types.js';

/** Methods the test wired answer; any other call fails loudly instead of answering 404. */
function unwired<T extends object>(name: string, wired: Partial<T> = {}): T {
  return new Proxy(wired, {
    get: (target, property) => {
      if (property === 'then') return undefined;
      if (property in target) return Reflect.get(target, property);
      return () => {
        throw new Error(`${name}.${String(property)} is not wired`);
      };
    },
  }) as T;
}

type Wireable = Exclude<keyof CoreApiDeps, 'config' | 'logger'>;
type WiredForTest = Pick<CoreApiDeps, 'config' | 'organizations' | 'events'> &
  Partial<Omit<ApiDeps, Wireable>> & {
    [K in Exclude<Wireable, 'organizations' | 'events'>]?: Partial<
      CoreApiDeps[K]
    >;
  };

/**
 * Test assembly: the caller wires what the scenario touches; every other core
 * dependency fails when used. Mirrors the production rule that core dependencies
 * are mandatory and edition inputs are optional.
 */
export function testDeps(wired: WiredForTest): ApiDeps {
  return {
    logger: silentLogger,
    ...wired,
    eventSetup: unwired('eventSetup', wired.eventSetup),
    classes: unwired('classes', wired.classes),
    pricing: unwired('pricing', wired.pricing),
    eventConsents: unwired('eventConsents', wired.eventConsents),
    entries: unwired('entries', wired.entries),
    entryDetails: unwired('entryDetails', wired.entryDetails),
    entryAdminActions: unwired('entryAdminActions', wired.entryAdminActions),
    entryWorkflows: unwired('entryWorkflows', wired.entryWorkflows),
    entryStatusDimensions: unwired(
      'entryStatusDimensions',
      wired.entryStatusDimensions,
    ),
    entryExports: unwired('entryExports', wired.entryExports),
    entryConfirmations: unwired('entryConfirmations', wired.entryConfirmations),
    entryDocuments: unwired('entryDocuments', wired.entryDocuments),
    artifactJobs: unwired('artifactJobs', wired.artifactJobs),
    overview: unwired('overview', wired.overview),
    payments: unwired('payments', wired.payments),
    paymentRecipients: unwired('paymentRecipients', wired.paymentRecipients),
    messages: unwired('messages', wired.messages),
    registrationSettings: unwired(
      'registrationSettings',
      wired.registrationSettings,
    ),
    registrationFormConfigs: unwired(
      'registrationFormConfigs',
      wired.registrationFormConfigs,
    ),
    publicRegistrationRateLimits: unwired(
      'publicRegistrationRateLimits',
      wired.publicRegistrationRateLimits,
    ),
  };
}

/** Public registration with the given service methods; the rest fail when called. */
export function testRegistration(
  service: Partial<PublicRegistrationService>,
  rateLimiter: RegistrationRateLimiter = createInMemoryRegistrationRateLimiter(),
): PublicRegistrationModule {
  return {
    service: unwired<PublicRegistrationService>('publicRegistration', service),
    rateLimiter,
  };
}
