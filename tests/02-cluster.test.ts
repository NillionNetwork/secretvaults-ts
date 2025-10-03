import { ClusterKey, SecretKey } from "@nillion/blindfold";
import { beforeEach, describe, expect, it } from "vitest";
import { conceal } from "#/common/blindfold";
import {
  executeOnCluster,
  prepareRequest,
  processConcealedListResponse,
  processConcealedObjectResponse,
  processPlaintextResponse,
} from "#/common/cluster";
import type { NilDbBaseClient } from "#/nildb/base-client";

function createNilDbBaseClients(count: number): NilDbBaseClient[] {
  // @ts-expect-error a primitive mock since we don't need anything fancy
  return Array.from({ length: count }, (_, i) => ({
    id: { didString: `node-${i + 1}` },
  }));
}

describe("executeOnCluster", () => {
  it("executes operation on all clients in parallel", async () => {
    const clients = createNilDbBaseClients(3);

    const operation = async (client: NilDbBaseClient, index: number) => {
      return `result-${client.id.didString}-${index}`;
    };

    const results = await executeOnCluster(clients, operation);

    expect(results).toEqual({
      "node-1": "result-node-1-0",
      "node-2": "result-node-2-1",
      "node-3": "result-node-3-2",
    });
  });

  it("propagates errors from failed operations", async () => {
    const clients = createNilDbBaseClients(2);
    const operation = async (client: NilDbBaseClient) => {
      if (client.id.didString.includes("node-2")) {
        throw new Error("Node 2 failed");
      }
      return "success";
    };

    try {
      await executeOnCluster(clients, operation);
      expect.fail("Should have thrown");
    } catch (failures: any) {
      expect(failures.at(0)?.error?.message).toBe("Node 2 failed");
    }
  });
});

describe("prepare plaintext request", () => {
  it("replicates body for each client", async () => {
    const clients = createNilDbBaseClients(3);
    const body = { message: "hello", count: 42 };
    const result: any = await prepareRequest({ key: undefined, clients, body });

    expect(result).toEqual({
      "node-1": { message: "hello", count: 42 },
      "node-2": { message: "hello", count: 42 },
      "node-3": { message: "hello", count: 42 },
    });
  });

  it("creates separate copies for each node", async () => {
    const clients = createNilDbBaseClients(2);
    const body = { data: [{ nested: "value" }] };
    const result: any = await prepareRequest({ key: undefined, clients, body });

    // Verify they're separate objects
    expect(result["node-1"]).not.toBe(result["node-2"]);
    expect(result["node-1"]).toEqual(result["node-2"]);
  });
});

describe("processPlaintextResponse", () => {
  it('selects first response with "first" strategy', () => {
    const results = {
      "node-1": "first",
      "node-2": "second",
      "node-3": "third",
    };

    const selected = processPlaintextResponse(results, "first");
    expect(selected).toBe("first");
  });

  it('selects random response with "random" strategy', () => {
    const results = {
      "node-1": "first",
      "node-2": "second",
    };

    const selected = processPlaintextResponse(results, "random");
    expect(["first", "second"]).toContain(selected);
  });

  it("defaults to first strategy when no strategy specified", () => {
    const results = {
      "node-1": "first",
      "node-2": "second",
    };

    const selected = processPlaintextResponse(results);
    expect(selected).toBe("first");
  });

  it("throws error when no responses available", () => {
    const results = {};

    expect(() => processPlaintextResponse(results)).toThrow(
      "Failed to select a canonical response",
    );
  });
});

describe("prepareConcealedRequest with SecretKey", () => {
  let key: SecretKey;
  let clients: NilDbBaseClient[];

  beforeEach(async () => {
    clients = createNilDbBaseClients(2);
    key = await SecretKey.generate({ nodes: [{}, {}] }, { store: true });
  });

  it("conceals and distributes single document across nodes", async () => {
    const body = {
      data: [
        {
          _id: "doc1",
          name: "Alice",
          secret: { "%allot": "confidential" },
        },
      ],
    };
    const result: any = await prepareRequest({ key, clients, body });

    // Should have entry for each client
    expect(Object.keys(result)).toHaveLength(2);
    expect(result).toHaveProperty("node-1");
    expect(result).toHaveProperty("node-2");

    // Each node should get one share of the document
    expect(result["node-1"].data).toHaveLength(1);
    expect(result["node-2"].data).toHaveLength(1);

    // Public fields should be identical
    expect(result["node-1"].data[0]._id).toBe("doc1");
    expect(result["node-1"].data[0].name).toBe("Alice");
    expect(result["node-2"].data[0]._id).toBe("doc1");
    expect(result["node-2"].data[0].name).toBe("Alice");

    // Secret fields should be shares
    expect(result["node-1"].data[0].secret).toHaveProperty("%share");
    expect(result["node-2"].data[0].secret).toHaveProperty("%share");
  });

  it("conceals and distributes multiple documents", async () => {
    const body = {
      data: [
        { _id: "doc1", value: { "%allot": "secret1" } },
        { _id: "doc2", value: { "%allot": "secret2" } },
      ],
    };

    const result: any = await prepareRequest({ key, clients, body });

    // Each node should get shares for both documents
    expect(result["node-1"].data).toHaveLength(2);
    expect(result["node-2"].data).toHaveLength(2);

    // Document ids should be preserved
    expect(result["node-1"].data[0]._id).toBe("doc1");
    expect(result["node-1"].data[1]._id).toBe("doc2");
  });
});

describe("prepareRequest with ClusterKey", () => {
  let key: ClusterKey;
  let clients: NilDbBaseClient[];

  beforeEach(async () => {
    clients = createNilDbBaseClients(3);
    key = await ClusterKey.generate({ nodes: [{}, {}, {}] }, { store: true });
  });

  it("distributes data across three nodes with ClusterKey", async () => {
    const body = {
      data: [
        {
          _id: "doc1",
          patent: { "%allot": "P12345" },
          hospital: "General Hospital",
        },
      ],
    };

    const result: any = await prepareRequest({ key, clients, body });

    // Shares exist and are different
    const share1 = result["node-1"].data[0].patent["%share"];
    const share2 = result["node-2"].data[0].patent["%share"];
    const share3 = result["node-3"].data[0].patent["%share"];
    expect((share1 !== share2) !== share3).toBeTruthy();

    // Public fields preserved
    expect(result["node-1"].data[0].hospital).toBe("General Hospital");
    expect(result["node-2"].data[0].hospital).toBe("General Hospital");
    expect(result["node-3"].data[0].hospital).toBe("General Hospital");
  });
});

describe("processConcealedListResponse", () => {
  let key: SecretKey;

  beforeEach(async () => {
    key = await SecretKey.generate({ nodes: [{}, {}] }, { store: true });
  });

  it("reveals multiple documents from node responses", async () => {
    const doc1 = {
      _id: "doc1",
      name: "Alice",
      secret: { "%allot": "secret1" },
    };
    const doc2 = { _id: "doc2", name: "Bob", secret: { "%allot": "secret2" } };

    const shares1 = await conceal(key, doc1);
    const shares2 = await conceal(key, doc2);

    // Simulate node responses with shares
    const resultsByNode: any = {
      "node-1": {
        data: [shares1[0], shares2[0]],
      },
      "node-2": {
        data: [shares1[1], shares2[1]],
      },
    };

    const revealed = await processConcealedListResponse({
      key,
      resultsByNode,
    });

    expect(revealed).toHaveLength(2);

    // Find documents by id since order may vary
    const revealedDoc1 = revealed.find((d) => d._id === "doc1");
    const revealedDoc2 = revealed.find((d) => d._id === "doc2");

    expect(revealedDoc1).toBeDefined();
    expect(revealedDoc2).toBeDefined();
    expect(revealedDoc1!.name).toBe("Alice");
    expect(revealedDoc1!.secret).toBe("secret1");
    expect(revealedDoc2!.name).toBe("Bob");
    expect(revealedDoc2!.secret).toBe("secret2");
  });

  it("handles single document from multiple nodes", async () => {
    const doc = { _id: "single", value: { "%allot": 42 } };
    const shares = await conceal(key, doc);

    const resultsByNode = {
      "node-1": { data: [shares[0]] },
      "node-2": { data: [shares[1]] },
    };

    const revealed = await processConcealedListResponse({
      key,
      resultsByNode,
    });

    expect(revealed).toHaveLength(1);
    expect(revealed[0]._id).toBe("single");
    expect(revealed[0].value).toBe(42n); // Numbers become BigInt
  });

  it("handles empty responses", async () => {
    const resultsByNode = {
      "node-1": { data: [] },
      "node-2": { data: [] },
    };

    const revealed = await processConcealedListResponse({
      key,
      resultsByNode,
    });

    expect(revealed).toHaveLength(0);
  });
});

describe("processConcealedListResponse with ClusterKey", () => {
  let key: ClusterKey;

  beforeEach(async () => {
    key = await ClusterKey.generate({ nodes: [{}, {}, {}] }, { store: true });
  });

  it("reveals documents with ClusterKey", async () => {
    const doc = { _id: "cluster-doc", patientId: { "%allot": "P12345" } };
    const shares = await import("#/common/blindfold").then(({ conceal }) =>
      conceal(key, doc),
    );

    const resultsByNode = {
      "node-1": { data: [shares[0]] },
      "node-2": { data: [shares[1]] },
      "node-3": { data: [shares[2]] },
    };

    const revealed = await processConcealedListResponse({
      key,
      resultsByNode,
    });

    expect(revealed).toHaveLength(1);
    expect(revealed[0]._id).toBe("cluster-doc");
    expect(revealed[0].patientId).toBe("P12345");
  });
});

describe("processConcealedObjectResponse", () => {
  let key: SecretKey;

  beforeEach(async () => {
    key = await SecretKey.generate({ nodes: [{}, {}] }, { store: true });
  });

  it("reveals single document from node responses", async () => {
    const doc = {
      _id: "single",
      name: "Test",
      secret: { "%allot": "confidential" },
    };
    const shares = await conceal(key, doc);

    const resultsByNode = {
      "node-1": { data: shares[0] },
      "node-2": { data: shares[1] },
    };

    const revealed = await processConcealedObjectResponse({
      key,
      resultsByNode,
    });

    expect(revealed._id).toBe("single");
    expect(revealed.name).toBe("Test");
    expect(revealed.secret).toBe("confidential");
  });

  it("handles complex nested data", async () => {
    const doc = {
      _id: "complex",
      user: {
        name: "Alice",
        details: {
          ssn: { "%allot": "123-45-6789" },
          phone: { "%allot": "555-1234" },
        },
      },
      public: "visible",
    };

    const shares = await conceal(key, doc);

    const resultsByNode = {
      "node-1": { data: shares[0] },
      "node-2": { data: shares[1] },
    };

    const revealed = await processConcealedObjectResponse({
      key,
      resultsByNode,
    });

    expect(revealed).toEqual({
      _id: "complex",
      user: {
        name: "Alice",
        details: {
          ssn: "123-45-6789",
          phone: "555-1234",
        },
      },
      public: "visible",
    });
  });
});

describe("processConcealedObjectResponse with ClusterKey", () => {
  let key: ClusterKey;

  beforeEach(async () => {
    key = await ClusterKey.generate({ nodes: [{}, {}, {}] }, { store: true });
  });

  it("reveals object with ClusterKey", async () => {
    const doc = { _id: "cluster-obj", diagnosis: { "%allot": "Confidential" } };
    const shares = await import("#/common/blindfold").then(({ conceal }) =>
      conceal(key, doc),
    );

    const resultsByNode = {
      "node-1": { data: shares[0] },
      "node-2": { data: shares[1] },
      "node-3": { data: shares[2] },
    };

    const revealed = await processConcealedObjectResponse({
      key,
      resultsByNode,
    });

    expect(revealed._id).toBe("cluster-obj");
    expect(revealed.diagnosis).toBe("Confidential");
  });
});
