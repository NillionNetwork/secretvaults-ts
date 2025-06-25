import {
  allot,
  ClusterKey,
  encrypt,
  SecretKey,
  unify,
} from "@nillion/blindfold";

export type BlindfoldOperation = "store" | "match" | "sum";

/**
 * Defines valid configurations for creating or using a Blindfold encryption key.
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

/**
 * @remarks
 * In @nillion/blindfold:
 *
 * 1. Data's outbound journey is a two-step process:
 *   - Traverse the object `encrypt()` values marked with `%allot`
 *   - Call @nillion/blindfold's `allot()` to turn %allot'ed values into shares
 * 2. Data's inbound journey is a single operation: `unify()` which handles recombining
 * shares and decryption
 *
 * This design feels asymmetric (eg blindfold handles everything inbound but not outbound),
 * but for now, 'conceal' and 'reveal' should encapsulate this asymmetry.
 */

/**
 * Encrypts fields marked with `%allot` and then splits the object into an array of secret shares.
 *
 * @example
 * declare const key: SecretKey | ClusterKey
 * const data = [{
 *   patientId: { "%allot": "user-123" }, // This value will be concealed
 *   visitDate: "2025-06-24",             // This value will remain public
 * }];
 *
 * // Output of conceal(key, data) assuming 2 nodes:
 * [
 *   // Document to be stored on Node 1
 *   {
 *     patientId: { "%share": "<ciphertext_a_for_user-123>" },
 *     visitDate: "2025-06-24",
 *   },
 *   // Document to be stored on Node 2
 *   {
 *     patientId: { "%share": "<ciphertext_a_for_user-123>" },
 *     visitDate: "2025-06-24",
 *   },
 * ]
 */
export async function conceal(
  key: SecretKey | ClusterKey,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const encryptDeep = async (value: unknown): Promise<unknown> => {
    // Base case: if it's not an object or is null, return
    if (typeof value !== "object" || value === null) {
      return value;
    }

    // Recurse: handle arrays
    if (Array.isArray(value)) {
      return Promise.all(value.map((e) => encryptDeep(e)));
    }

    // Recurse: handle objects
    const encryptedObj: Record<string, unknown> = {};
    for (const [oKey, oVal] of Object.entries(value)) {
      if (typeof oVal === "object" && oVal !== null) {
        // encrypt values
        if ("%allot" in oVal) {
          const plaintext = oVal["%allot"];
          encryptedObj[oKey] = {
            "%allot": await encrypt(key, plaintext),
          };
        } else {
          // Otherwise, continue the recursion
          encryptedObj[oKey] = await encryptDeep(oVal);
        }
      } else {
        // Directly copy primitive values
        encryptedObj[oKey] = oVal;
      }
    }
    return encryptedObj;
  };

  const encryptedData = (await encryptDeep(data)) as Record<string, unknown>;

  // splits data into one record per-node where each node gets a secret share
  return allot(encryptedData) as Record<string, unknown>[];
}

/**
 * Recombines an array of secret shares and decrypts the concealed values to restore the original object.
 *
 * @example
 * declare const key: SecretKey | ClusterKey
 * const shares = [
 *   {
 *     patientId: { "%share": "<ciphertext_A_for_user-123>" },
 *     visitDate: "2025-06-24",
 *   },
 *   {
 *     patientId: { "%share": "<ciphertext_B_for_user-123>" },
 *     visitDate: "2025-06-24",
 *   },
 * ];
 *
 * // Output of reveal(key, shares):
 * {
 *   patientId: "user-123",
 *   visitDate: "2025-06-24",
 * }
 */
export async function reveal(
  key: SecretKey | ClusterKey,
  shares: Record<string, unknown>[],
): Promise<Record<string, unknown>> {
  const unified = await unify(key, shares);
  return unified as Record<string, unknown>;
}
