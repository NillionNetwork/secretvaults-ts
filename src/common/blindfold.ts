import {
  allot,
  ClusterKey,
  encrypt,
  SecretKey,
  unify,
} from "@nillion/blindfold";
import { Log } from "#/logger";

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
      seed?: Uint8Array | Buffer | string;
      useClusterKey?: never; // Explicitly forbid useClusterKey
      threshold?: number;
    }
  //
  // --- Scenario 3: Generate a ClusterKey (disallows seed) ---
  //
  | {
      operation: "store" | "match";
      seed?: never; // Explicitly forbid seed
      useClusterKey: true;
      threshold?: never;
    }
  | {
      operation: "sum";
      seed?: never; // Explicitly forbid seed
      useClusterKey: true;
      threshold?: number;
    };

export async function toBlindfoldKey(
  options: BlindfoldFactoryConfig & { clusterSize: number },
): Promise<SecretKey | ClusterKey> {
  Log.debug(
    {
      hasExistingKey: "key" in options,
      operation: "operation" in options ? options.operation : "existing-key",
      clusterSize: options.clusterSize,
      useClusterKey: "useClusterKey" in options ? options.useClusterKey : false,
      hasSeed: "seed" in options && options.seed !== undefined,
    },
    "Creating blindfold key",
  );

  if ("key" in options) {
    Log.debug({ keyType: options.key.constructor.name }, "Using existing key");
    return options.key;
  }

  const { operation, clusterSize } = options;

  const op = {
    [operation]: true,
  };

  const threshold = "threshold" in options ? options.threshold : undefined;
  const cluster = { nodes: new Array(clusterSize).fill({}) };

  const useClusterKey = "useClusterKey" in options && options.useClusterKey;
  const useSeed = "seed" in options && options.seed !== undefined;
  const isClusterKey = useClusterKey || (!useSeed && clusterSize > 1);

  const type = isClusterKey ? "ClusterKey" : "SecretKey";
  const key = isClusterKey
    ? await ClusterKey.generate(cluster, op, threshold)
    : await SecretKey.generate(
        cluster,
        op,
        threshold,
        "seed" in options ? options.seed : undefined,
      );

  Log.debug(
    {
      key: type,
      operation,
      threshold,
      nodes: clusterSize,
    },
    "Key generated",
  );
  return key;
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
  Log.debug(
    {
      keyType: key.constructor.name,
      dataKeys: Object.keys(data),
    },
    "Starting data concealment",
  );
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
  const shares = allot(encryptedData) as Record<string, unknown>[];

  Log.debug(
    { type: key.constructor.name, shares: shares.length },
    "Data concealed",
  );

  return shares;
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

  Log.debug(
    {
      type: key.constructor.name,
      keys: Object.keys(unified as Record<string, unknown>),
    },
    "Revealed data",
  );

  return unified as Record<string, unknown>;
}
