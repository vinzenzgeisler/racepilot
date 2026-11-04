export * from './modules-registry.js';
export {
  allowAllModuleEntitlements,
  capabilitiesFor,
  modulePermissionsFor,
  resolveEventModuleAccess,
  resolveEventModuleCapabilities,
  resolveOrganizationModuleCapabilities,
} from './modules-access.js';
export type {
  EventModuleAccess,
  ModuleAccess,
  ModuleActivationRepository,
  ModuleAvailability,
  ModuleDeps,
  ModuleEntitlements,
  ModuleScope,
  ModuleSnapshot,
  ModuleStateRecord,
  ModuleView,
  ModuleWrite,
} from './modules-access.js';
export {
  listEventModules,
  listOrganizationModules,
} from './modules-queries.js';
export type { ModuleChange } from './modules-queries.js';
export {
  createInMemoryModuleActivationRepository,
  setEventModule,
  setOrganizationModule,
} from './modules-mutations.js';
