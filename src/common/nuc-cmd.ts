import { Command } from "@nillion/nuc";

function createNucNamespace(prefix: string) {
  const base = prefix.split("/");
  return {
    root: new Command([...base]),
    create: new Command([...base, "create"]),
    read: new Command([...base, "read"]),
    update: new Command([...base, "update"]),
    delete: new Command([...base, "delete"]),
    execute: new Command([...base, "execute"]),
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
      root: new Command(["nil", "db"]),
      system: createNucNamespace("nil/db/system"),
      builders: createNucNamespace("nil/db/builders"),
      data: createNucNamespace("nil/db/data"),
      collections: createNucNamespace("nil/db/collections"),
      queries: createNucNamespace("nil/db/queries"),
      users: createNucNamespace("nil/db/users"),
    } as const,
  } as const,
} as const;
