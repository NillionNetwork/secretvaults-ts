import { ClusterKey, SecretKey } from "@nillion/blindfold";

export type BlindfoldOperation = "store" | "match" | "sum";

/**
 * Defines the configuration for creating or using a Blindfold encryption key.
 * This union uses the `never` type to ensure that properties for different
 * key generation strategies (e.g., `seed` vs. `useClusterKey`) are mutually exclusive.
 */
export type BlindfoldFactoryConfig =
  //
  // --- Scenario 1: Use a pre-existing key ---
  //
  | {
      key: SecretKey | ClusterKey;
      // Forbid all other properties
      operation?: never;
      seed?: never;
      useClusterKey?: never;
      threshold?: never;
    }
  //
  // --- Scenario 2: Generate a SecretKey (allows seed) ---
  //
  | {
      operation: "store" | "match";
      seed?: Uint8Array | Buffer | string;
      useClusterKey?: never; // Explicitly forbid useClusterKey
      threshold?: never;
    }
  | {
      operation: "sum";
      threshold?: number;
      seed?: Uint8Array | Buffer | string;
      useClusterKey?: never; // Explicitly forbid useClusterKey
    }
  //
  // --- Scenario 3: Generate a ClusterKey (disallows seed) ---
  //
  | {
      operation: "store" | "match";
      useClusterKey: true;
      seed?: never; // Explicitly forbid seed
      threshold?: never;
    }
  | {
      operation: "sum";
      threshold?: number;
      useClusterKey: true;
      seed?: never; // Explicitly forbid seed
    };

export async function toBlindfoldKey(
  options: BlindfoldFactoryConfig & { clusterSize: number },
): Promise<SecretKey | ClusterKey> {
  if ("key" in options) {
    return options.key;
  }

  const { operation, clusterSize } = options;

  const operations = {
    store: operation === "store",
    match: operation === "match",
    sum: operation === "sum",
  };
  const threshold = "threshold" in options ? options.threshold : undefined;
  const cluster = { nodes: new Array(clusterSize).fill({}) };

  const useClusterKey = "useClusterKey" in options && options.useClusterKey;
  const useSeed = "seed" in options && options.seed !== undefined;
  const isClusterKey = useClusterKey || (!useSeed && clusterSize > 1);

  return isClusterKey
    ? await ClusterKey.generate(cluster, operations, threshold)
    : await SecretKey.generate(
        cluster,
        operations,
        threshold,
        "seed" in options ? options.seed : undefined,
      );
}
