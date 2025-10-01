function createNucNamespace(prefix: string) {
  return {
    root: `/${prefix}`,
    create: `/${prefix}/create`,
    read: `/${prefix}/read`,
    update: `/${prefix}/update`,
    delete: `/${prefix}/delete`,
    execute: `/${prefix}/execute`,
  };
}

/**
 * Command namespace for NilDB operations.
 *
 * Provides pre-configured command objects for interacting with different
 * NilDB subsystems including system, builders, data, collections, queries, and users.
 *
 * @example
 * ```typescript
 * import { NucCmd } from "@nillion/secretvaults";
 *
 * // Use for creating a collection
 * const command = NucCmd.nil.db.collections.create;
 * ```
 */
export const NucCmd = {
  nil: {
    db: {
      root: "/nil/db",
      system: createNucNamespace("nil/db/system"),
      builders: createNucNamespace("nil/db/builders"),
      data: createNucNamespace("nil/db/data"),
      collections: createNucNamespace("nil/db/collections"),
      queries: createNucNamespace("nil/db/queries"),
      users: createNucNamespace("nil/db/users"),
    } as const,
  } as const,
} as const;
