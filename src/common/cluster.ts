import type { ClusterKey, SecretKey } from "@nillion/blindfold";
import { conceal, reveal } from "#/common/blindfold";
import type { ByNodeName } from "#/common/types";
import type { Did } from "#/dto/common";
import type { NilDbBaseClient } from "#/nildb/base-client";

/**
 * Executes an asynchronous operation on a list of clients in parallel.
 */
export async function executeOnCluster<Client extends NilDbBaseClient, T>(
  nodes: Client[],
  operation: (client: Client, index: number) => Promise<T>,
): Promise<ByNodeName<T>> {
  const promises = nodes.map(async (client, index) => {
    const result = await operation(client, index);
    return [client.id.toString(), result] as const;
  });

  const results = await Promise.all(promises);
  return Object.fromEntries(results);
}

/**
 * Prepares a request by concealing its data for distribution to all nodes.
 */
export async function prepareConcealedRequest<
  T extends { data: Record<string, unknown>[] },
>(options: {
  key: SecretKey | ClusterKey;
  clients: NilDbBaseClient[];
  body: T;
}): Promise<ByNodeName<T>> {
  const { key, clients, body } = options;

  // 1. Conceal documents, eg: [[doc1_shareA, doc1_shareB], [doc2_shareA, doc2_shareB]].
  const concealedDocs = await Promise.all(
    body.data.map((d) => conceal(key, d)),
  );

  // Ensure the number of shares matches the number of clients/nodes.
  if (concealedDocs.at(0)?.length !== clients.length) {
    throw new Error("Concealed shares count must match node count.");
  }

  // 2. Transpose the results from a document-major to a node-major structure.
  // We now have an array where the top-level index corresponds to the client index.
  // Result: [[doc1_shareA, doc2_shareA], [doc1_shareB, doc2_shareB]]
  const sharesByNode = clients.map((_, i) =>
    concealedDocs.map((shares) => shares[i]),
  );

  // 3. Map to pairs of [Did, payload] for conversion into a ByNodeName object.
  const pairs = clients.map((client, index) => {
    const payload: T = { ...body, data: sharesByNode[index] };
    return [client.id.toString(), payload] as const;
  });

  return Object.fromEntries(pairs);
}

/**
 * Prepares a plaintext request by replicating the body for each node.
 */
export function preparePlaintextRequest<T>(options: {
  clients: NilDbBaseClient[];
  body: T;
}): ByNodeName<T> {
  const { clients, body } = options;

  const pairs: [Did, T][] = clients.map(
    (c) => [c.id.toString(), { ...body }] as const,
  );

  return Object.fromEntries(pairs);
}

/**
 * Selects a single canonical response from a map of node results.
 */
export function processPlaintextResponse<T>(
  results: ByNodeName<T>,
  strategy: "first" | "random" = "first",
): T {
  const values = Object.values(results);

  // 1. Determine the index based on the chosen strategy.
  let index = 0; // Default to 'first'
  if (strategy === "random") {
    index = Math.floor(Math.random() * values.length);
  }

  // 2. Select the result using the determined index.
  const selected = values.at(index);

  // 3. Safeguard
  if (selected === undefined) {
    throw new Error("Failed to select a canonical response.", {
      cause: results,
    });
  }

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

  // 1. Flatten responses into an array of document shares.
  const allShares = Object.values(resultsByNode).flatMap((r) => r.data);

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

  // 3. Create an array of reveal promises, one for each document group.
  const revealPromises = Array.from(groupedShares.values()).map((shares) =>
    reveal(key, shares),
  );

  // 4. Await all reveal operations to run in parallel for maximum efficiency.
  return await Promise.all(revealPromises);
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

  const shares = Object.values(resultsByNode).map((response) => response.data);

  return reveal(key, shares);
}
