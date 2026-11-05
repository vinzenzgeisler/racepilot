import type { Database } from './database.js';
import type { EntryRepository } from '@racepilot/core';
import { createEntryWriteMethods } from './entry-write-methods.js';
import { createEntryReadMethods } from './entry-read-methods.js';
import { createEntryCountMethods } from './entry-counts.js';
import { createEntryTransitionMethod } from './entry-transition-method.js';
export function createEntryRepository(db: Database): EntryRepository {
  const writes = createEntryWriteMethods(db);
  const reads = createEntryReadMethods(db);
  const transition = createEntryTransitionMethod(db);
  return {
    create: writes.create,
    getById: reads.getById,
    listAdmin: reads.listAdmin,
    countByStatus: createEntryCountMethods(db).countByStatus,
    transition: transition.transition,
    softDelete: writes.softDelete,
  };
}
