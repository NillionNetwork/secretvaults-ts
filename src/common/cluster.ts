import type { ClusterKey, SecretKey } from "@nillion/blindfold";
import _ from "es-toolkit/compat";
import { conceal, reveal } from "#/common/blindfold";
import type { ByNodeName, DidString } from "#/dto/common";
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

  const promises = nodes.map(async (client, index): Promise<[DidString, T]> => {
    const node = client.id.didString as DidString;
    Log.debug({ node, index }, "Starting node operation");

    try {
      const result = await operation(client, index);
      return [node, result];
    } catch (error) {
      throw [node, error];
    }
  });

  const results = await Promise.allSettled(promises);

  const successes: [DidString, T][] = [];
  const failures: { node: DidString; error: unknown }[] = [];

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
 *       value: { "%allot": "secret-value" }
 *     }]
 *   }
 * });
 * // Returns: {
 * //   "node1": { data: [{ foo: "bar", value: {"%share": "encrypted-share-1"} }] },
 * //   "node2": { data: [{ foo: "bar", value: {"%share": "encrypted-share-2"} }] },
 * //   "node3": { data: [{ foo: "bar", value: {"%share": "encrypted-share-3"} }] },
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

  // If a key is provided, conceal the data and map shares to nodes.
  if (key) {
    const shares = await conceal(key, body);

    if (shares.length !== clients.length) {
      throw new Error(
        `Number of secret shares (${shares.length}) does not match number of clients (${clients.length}).`,
      );
    }

    const result: ByNodeName<T> = {};
    clients.forEach((client, index) => {
      result[client.id.didString] = shares[index] as T;
    });
    return result;
  }

  // If no key, just create a deep copy for each client.
  const result: ByNodeName<T> = {};
  clients.forEach((client) => {
    result[client.id.didString] = _.cloneDeep(body);
  });
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
