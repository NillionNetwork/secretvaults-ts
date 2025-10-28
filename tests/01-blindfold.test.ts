import { ClusterKey, SecretKey } from "@nillion/blindfold";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type BlindfoldFactoryConfig,
  conceal,
  reveal,
  toBlindfoldKey,
} from "#/common/blindfold";

describe("user provides the key", () => {
  it("returns the provided SecretKey", async () => {
    const existingKey = await SecretKey.generate(
      { nodes: [{}, {}] },
      { store: true },
    );

    const result = await toBlindfoldKey({
      key: existingKey,
      clusterSize: 2,
    });

    expect(result).toBe(existingKey);
    expect(result).toBeInstanceOf(SecretKey);
  });

  it("returns the provided ClusterKey", async () => {
    const existingKey = await ClusterKey.generate(
      { nodes: [{}, {}] },
      { store: true },
    );

    const result = await toBlindfoldKey({
      key: existingKey,
      clusterSize: 2,
    });

    expect(result).toBe(existingKey);
    expect(result).toBeInstanceOf(ClusterKey);
  });
});

describe("the key is generated", () => {
  it("generates ClusterKey when clusterSize > 1 and no seed for store", async () => {
    const config: BlindfoldFactoryConfig = {
      operation: "store",
    };

    const result = await toBlindfoldKey({
      ...config,
      clusterSize: 2,
    });

    expect(result).toBeInstanceOf(ClusterKey);
  });

  it("generates SecretKey when seed is provided", async () => {
    const config: BlindfoldFactoryConfig = {
      operation: "store",
      seed: "test-seed",
    };

    const result = await toBlindfoldKey({
      ...config,
      clusterSize: 2,
    });

    expect(result).toBeInstanceOf(SecretKey);
  });

  it("generates SecretKey when clusterSize = 1", async () => {
    const config: BlindfoldFactoryConfig = {
      operation: "store",
    };

    const result = await toBlindfoldKey({
      ...config,
      clusterSize: 1,
    });

    expect(result).toBeInstanceOf(SecretKey);
  });

  it("generates ClusterKey when useClusterKey is true", async () => {
    const config: BlindfoldFactoryConfig = {
      operation: "store",
      useClusterKey: true,
    };

    const result = await toBlindfoldKey({
      ...config,
      clusterSize: 3,
    });

    expect(result).toBeInstanceOf(ClusterKey);
  });
});

describe("conceal and reveal with SecretKey", () => {
  let key: SecretKey;

  beforeEach(async () => {
    key = await SecretKey.generate({ nodes: [{}, {}] }, { store: true });
  });

  it("should conceal and reveal simple data", async () => {
    const originalData = {
      name: "John Doe",
      age: { "%allot": 30 }, // the key to conceal
      city: "New York",
    };

    const shares = await conceal(key, originalData);
    expect(shares).toHaveLength(2); // 2 nodes

    for (const share of shares) {
      expect(share.name).toBe("John Doe");
      expect(share.city).toBe("New York");
      expect(share.age).toHaveProperty("%share");
    }

    const revealed = await reveal(key, shares);
    expect(revealed.name).toBe("John Doe");
    expect(revealed.age).toBe(30n);
    expect(revealed.city).toBe("New York");
  });

  it("nested concealed values", async () => {
    const originalData = {
      user: {
        name: "Alice",
        details: {
          ssn: { "%allot": "123-45-6789" },
          phone: { "%allot": "555-1234" },
        },
      },
      public: "visible",
    };

    const shares = await conceal(key, originalData);
    expect(shares).toHaveLength(2);

    const revealed = await reveal(key, shares);
    expect(revealed).toEqual({
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

  it("arrays with concealed values", async () => {
    const originalData = {
      items: [
        { id: 1, secret: { "%allot": "secret1" } },
        { id: 2, secret: { "%allot": "secret2" } },
      ],
      count: 2,
    };

    const shares = await conceal(key, originalData);
    const revealed = await reveal(key, shares);

    expect(revealed).toEqual({
      items: [
        { id: 1, secret: "secret1" },
        { id: 2, secret: "secret2" },
      ],
      count: 2,
    });
  });

  it("data with no concealed values", async () => {
    const originalData = {
      name: "Public Data",
      value: 123,
      nested: { info: "all public" },
    };

    const shares = await conceal(key, originalData);
    // Even with no concealed values, allot() returns shares
    expect(shares.length).toBeGreaterThan(0);

    const revealed = await reveal(key, shares);
    expect(revealed).toEqual(originalData);
  });

  it("handle empty objects", async () => {
    const originalData = {};

    const shares = await conceal(key, originalData);
    const revealed = await reveal(key, shares);

    expect(revealed).toEqual({});
  });

  it("null values and concealed fields", async () => {
    const originalData = {
      nullValue: null,
      secret: { "%allot": "hidden" },
    };

    const shares = await conceal(key, originalData);
    const revealed = await reveal(key, shares);

    expect(revealed.nullValue).toBe(null);
    expect(revealed.secret).toBe("hidden");
  });
});

describe("conceal and reveal with ClusterKey", () => {
  let key: ClusterKey;

  beforeEach(async () => {
    key = await ClusterKey.generate({ nodes: [{}, {}, {}] }, { store: true });
  });

  it("conceal and reveal with ClusterKey", async () => {
    const originalData = {
      patientId: { "%allot": "P12345" },
      diagnosis: { "%allot": "Confidential" },
      hospital: "General Hospital",
    };

    const shares = await conceal(key, originalData);
    expect(shares).toHaveLength(3);

    const revealed = await reveal(key, shares);
    expect(revealed).toEqual({
      patientId: "P12345",
      diagnosis: "Confidential",
      hospital: "General Hospital",
    });
  });

  it("complex nested structures with ClusterKey", async () => {
    const originalData = {
      level1: {
        level2: {
          level3: {
            secret: { "%allot": "deep-secret" },
            public: "visible",
          },
          info: "metadata",
        },
      },
    };

    const shares = await conceal(key, originalData);
    const revealed = await reveal(key, shares);

    expect(revealed).toEqual({
      level1: {
        level2: {
          level3: {
            secret: "deep-secret",
            public: "visible",
          },
          info: "metadata",
        },
      },
    });
  });
});

describe("data type handling", () => {
  let key: SecretKey;

  beforeEach(async () => {
    key = await SecretKey.generate({ nodes: [{}, {}] }, { store: true });
  });

  it("string concealment", async () => {
    const originalData = {
      text: { "%allot": "hello world" },
    };

    const shares = await conceal(key, originalData);
    const revealed = await reveal(key, shares);

    expect(revealed.text).toBe("hello world");
  });

  it("numbers concealed as BigInt", async () => {
    const originalData = {
      value: { "%allot": 42 },
    };

    const shares = await conceal(key, originalData);
    const revealed = await reveal(key, shares);

    expect(revealed.value).toBe(42n);
  });

  it("non-primitive concealed as strings", async () => {
    const originalData = {
      boolean: { "%allot": true },
      object: { "%allot": { key: "value" } },
      array: { "%allot": [1, 2, 3] },
    };

    const shares = await conceal(key, originalData);
    const revealed = await reveal(key, shares);

    // Non-primitive types are converted to strings
    expect(revealed.boolean).toBe("true");
    expect(revealed.object).toBe("[object Object]");
    expect(revealed.array).toBe("1,2,3");
  });
});
