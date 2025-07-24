import { type ClusterKey, encrypt, type SecretKey } from "@nillion/blindfold";
import { isPlainObject } from "es-toolkit";
import { reveal } from "#/common/blindfold";
import type { ByNodeName, Did } from "#/common/types";
import { Log } from "#/logger";
import type { NilDbBaseClient } from "#/nildb/base-client";

/**
 * Executes an asynchronous operation on a list of clients in parallel.
 */
export async function executeOnCluster<Client extends NilDbBaseClient, T>(
  nodes: Client[],
  operation: (client: Client, index: number) => Promise<T>,
): Promise<ByNodeName<T>> {
  Log.debug({ nodes: nodes.length }, "Executing cluster operation");

  const promises = nodes.map(async (client, index): Promise<[Did, T]> => {
    const node = client.id.toString() as Did;
    Log.debug({ node, index }, "Starting node operation");

    try {
      const result = await operation(client, index);
      return [node, result];
    } catch (error) {
      throw [node, error];
    }
  });

  const results = await Promise.allSettled(promises);

  const successes: [Did, T][] = [];
  const failures: { node: Did; error: unknown }[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      successes.push(result.value);
    } else {
      const [node, error] = result.reason;
      const cause = error.cause;

      const flattened = {
        message: error?.message ?? "",
        body: cause?.body ?? undefined,
        status: cause?.status ?? undefined,
      };

      failures.push({
        node,
        error: flattened,
      });
    }
  }

  if (failures.length > 0) {
    Log.error({ successes, failures }, "Cluster operation failed");
    throw failures;
  }

  Log.debug("Cluster operation succeeded");

  return Object.fromEntries(successes);
}

type AllotInfo = {
  path: string;
  value: string | number | bigint | Uint8Array<ArrayBufferLike>;
};

/**
 * Recursively walks a data structure (objects and arrays) to find all properties
 * with the key "%allot" (case-insensitive) and returns their dot-notation paths and values.
 *
 * @example
 * const obj = {
 *   "%allot": "secret1",
 *   data: [
 *     { "%allot": "secret2" },
 *     { nested: { "%ALLOT": "secret3" } }
 *   ]
 * };
 *
 * findAllotPathsAndValues(obj);
 * // Returns:
 * // [
 * //   { path: "%allot", value: "secret1" },
 * //   { path: "data.0.%allot", value: "secret2" },
 * //   { path: "data.1.nested.%ALLOT", value: "secret3" }
 * // ]
 */
function findAllotPathsAndValues(
  node: Record<string, unknown> | unknown[],
  currentPath = "",
): AllotInfo[] {
  // Handle arrays
  if (Array.isArray(node)) {
    return node.flatMap((item, index) => {
      const fullPath = currentPath ? `${currentPath}.${index}` : `${index}`;
      if (isPlainObject(item)) {
        return findAllotPathsAndValues(
          item as Record<string, unknown>,
          fullPath,
        );
      }
      return [];
    });
  }

  // Handle objects
  return Object.entries(node).flatMap(([key, value]) => {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;

    if (key.toLowerCase() === "%allot") {
      return [{ path: fullPath, value }];
    }
    if (isPlainObject(value)) {
      return findAllotPathsAndValues(
        value as Record<string, unknown>,
        fullPath,
      );
    }
    if (Array.isArray(value)) {
      return findAllotPathsAndValues(value, fullPath);
    }
    return [];
  }) as AllotInfo[];
}

/**
 * Prepares a request body for distribution across multiple nodes by creating copies
 * of the body and secret-sharing any values marked with %allot keys.
 *
 * @example
 * const result = await prepareRequest({
 *   key: secretKey,
 *   clients: [client1, client2, client3],
 *   body: {
 *     data: [{
 *       foo: "bar",
 *       "%allot": "secret-value"
 *     }]
 *   }
 * });
 * // Returns: {
 * //   "node1": { data: [{ foo: "bar", "%share": "encrypted-share-1" }] },
 * //   "node2": { data: [{ foo: "bar", "%share": "encrypted-share-2" }] },
 * //   "node3": { data: [{ foo: "bar", "%share": "encrypted-share-3" }] },
 * // }
 */
export async function prepareRequest<
  T extends Record<string, unknown>,
>(options: {
  key: SecretKey | ClusterKey | undefined;
  clients: NilDbBaseClient[];
  body: T;
}): Promise<ByNodeName<T>> {
  const { key, clients, body } = options;

  // 1. Find all %allot values in the body
  const allots = findAllotPathsAndValues(body);

  // 2. Warn if %allots found but no key configured
  if (!key && allots.length > 0) {
    throw new Error(`No key but ${allots.length} %allot(s) detected in data`);
  }

  // 3. Create secret shares for each %allot value if key exists
  const sharesMap = new Map<string, Record<string, unknown>>();
  if (key && allots.length > 0) {
    for (const { path, value } of allots) {
      // Encrypt the value to create shares
      const encryptedShares = await encrypt(key, value);

      // Map shares to node Dids
      const sharesByNode: Record<string, unknown> = {};
      clients.forEach((client, index) => {
        sharesByNode[client.id.toString()] = encryptedShares[index];
      });

      sharesMap.set(path, sharesByNode);
    }
  }

  // 4 & 5. Create copies and replace %allot: <value> with %share: <nodeX_encrypted_share>
  const result: ByNodeName<T> = {} as ByNodeName<T>;

  clients.forEach((client) => {
    const bodyCopy = structuredClone(body) as T;

    // Replace each %allot with %share for this node
    if (key && allots.length > 0) {
      for (const { path } of allots) {
        const sharesByNode = sharesMap.get(path);
        if (sharesByNode) {
          // Parse the path to handle array indices
          const pathParts = path.split(".");
          const allotKey = pathParts.pop(); // This should be "%allot" or "%ALLOT"
          if (!allotKey) {
            throw new Error(
              `Expected an allot key in the path parts: ${pathParts}`,
            );
          }

          if (pathParts.length === 0) {
            delete bodyCopy[allotKey];
            // @ts-expect-error correcting types requires out of scope wider refactor
            bodyCopy["%share"] = sharesByNode[client.id.toString()];
          } else {
            // biome-ignore lint/suspicious/noExplicitAny: Navigate to parent to handle array indices
            let parent: any = bodyCopy;
            for (const part of pathParts) {
              // Check if part is a number (array index)
              const index = Number(part);
              if (Number.isNaN(index)) {
                parent = parent[part];
              } else {
                parent = parent[index];
              }
            }

            // Replace %allot with %share
            delete parent[allotKey];
            parent["%share"] = sharesByNode[client.id.toString()];
          }
        }
      }
    }

    // @ts-expect-error correcting types requires out of scope wider refactor
    result[client.id.toString()] = bodyCopy;
  });

  // 6. Return the bodies mapped by node name
  return result;
}

/**
 * Selects a single canonical response from a map of node results.
 */
export function processPlaintextResponse<T>(
  results: ByNodeName<T>,
  strategy: "first" | "random" = "first",
): T {
  const values = Object.values(results);

  Log.debug(
    { nodes: values.length, strategy },
    "Processing plaintext response",
  );

  // 1. Determine the index based on the chosen strategy.
  let index = 0; // Default to 'first'
  if (strategy === "random") {
    index = Math.floor(Math.random() * values.length);
  }

  // 2. Select the result using the determined index.
  const selected = values.at(index);

  // 3. Safeguard
  if (selected === undefined) {
    Log.error({ resultsCount: values.length }, "No response to select");
    throw new Error("Failed to select a canonical response.", {
      cause: results,
    });
  }

  Log.debug({ selectedIndex: index }, "Response selected");
  return selected;
}

/**
 * Processes and reveals a list of documents from a cluster response.
 */
export async function processConcealedListResponse<
  T extends { data: Record<string, unknown>[] },
>(options: {
  key: SecretKey | ClusterKey;
  resultsByNode: ByNodeName<T>;
}): Promise<Record<string, unknown>[]> {
  const { key, resultsByNode } = options;

  Log.debug(
    {
      key: key.constructor.name,
      nodes: Object.keys(resultsByNode).length,
    },
    "Processing concealed list response",
  );

  // 1. Flatten responses into an array of document shares.
  const allShares = Object.values(resultsByNode).flatMap((r) => r.data);
  Log.debug({ totalShares: allShares.length }, "Flattened document shares");

  // 2. Group shares by their id.
  const groupedShares = allShares.reduce((acc, doc) => {
    const docId = doc._id as string;
    if (docId) {
      // Get the existing group or create a new one.
      const group = acc.get(docId) ?? [];
      group.push(doc);
      acc.set(docId, group);
    }
    return acc;
  }, new Map<string, Record<string, unknown>[]>());

  Log.debug(
    { documentCount: groupedShares.size },
    "Grouped shares by document ID",
  );

  // 3. Create an array of reveal promises, one for each document group.
  const revealPromises = Array.from(groupedShares.values()).map((shares) =>
    reveal(key, shares),
  );

  // 4. Await all reveal operations to run in parallel for maximum efficiency.
  const revealed = await Promise.all(revealPromises);
  Log.debug(
    { revealedCount: revealed.length },
    "Documents revealed successfully",
  );

  return revealed;
}

/**
 * Processes and reveals a single document from a cluster response.
 */
export async function processConcealedObjectResponse<
  T extends { data: Record<string, unknown> },
>(options: {
  key: SecretKey | ClusterKey;
  resultsByNode: ByNodeName<T>;
}): Promise<Record<string, unknown>> {
  const { key, resultsByNode } = options;

  Log.debug(
    {
      key: key.constructor.name,
      nodes: Object.keys(resultsByNode).length,
    },
    "Processing concealed object response",
  );

  const shares = Object.values(resultsByNode).map((response) => response.data);
  Log.debug({ shareCount: shares.length }, "Collected object shares");

  const revealed = await reveal(key, shares);
  Log.debug("Object revealed successfully");

  return revealed;
}
