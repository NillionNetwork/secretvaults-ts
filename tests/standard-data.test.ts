import * as crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import { describe } from "vitest";
import type { ByNodeName, Uuid } from "#/common/types";
import type { CreateCollectionRequest } from "#/dto/collections.dto";
import collection from "./data/standard.collection.json";
import query from "./data/standard.query.json";
import { createFixture } from "./fixture/fixture";
import { delay, waitForQueryRun } from "./fixture/utils";

describe("standard-data.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture({
    activateBuilderSubscription: true,
    keepDbs: false,
  });

  collection._id = crypto.randomUUID().toString() as Uuid;
  query._id = crypto.randomUUID().toString() as Uuid;

  let data: Array<{ _id: string; name: string }>;

  beforeAll(async (c) => {
    const { builder } = c;

    await builder.register({
      did: builder.did.toString(),
      name: faker.company.name(),
    });
  });
  afterAll(async (_c) => {});

  test("create a standard collection", async ({ c }) => {
    const { builder, expect } = c;

    const _results = await builder.createCollection(
      collection as CreateCollectionRequest,
    );

    // pause to avoid race condition
    await delay(1000);

    const results = await builder.readBuilderProfile();
    const pairs = Object.entries(results);

    for (const [_name, result] of pairs) {
      expect(result.data.collections).toHaveLength(1);
      expect(result.data.collections.at(0)).toBe(collection._id);
    }
  });

  test("upload data", async ({ c }) => {
    const { builder, expect } = c;

    data = [
      {
        _id: crypto.randomUUID().toString(),
        name: "tim",
      },
    ];

    const results = await builder.createStandardData({
      body: {
        collection: collection._id,
        data,
      },
    });
    const pairs = Object.entries(results);

    expect(Object.keys(results)).toHaveLength(2);
    for (const [_, result] of pairs) {
      expect(result.data.errors).toHaveLength(0);
      expect(result.data.created.at(0)).toBe(data.at(0)?._id);
    }
  });

  test("read builder profile", async ({ c }) => {
    const { builder, expect } = c;

    const results = await builder.readBuilderProfile();
    const node153c = results["153c"].data;
    const node2340 = results["2340"].data;

    expect(node153c.collections).toHaveLength(1);
    expect(node2340.collections).toHaveLength(1);
    expect(node153c.collections.at(0)).toBe(collection._id);
    expect(node2340.collections.at(0)).toBe(collection._id);
  });

  test("update builder profile", async ({ c }) => {
    const { builder, expect } = c;

    const updatedName = faker.company.name();
    await builder.updateBuilderProfile({ name: updatedName });

    const results = await builder.readBuilderProfile();
    const node153c = results["153c"].data;
    const node2340 = results["2340"].data;

    expect(node153c.name).toBe(updatedName);
    expect(node2340.name).toBe(updatedName);
  });

  test("read collection metadata", async ({ c }) => {
    const { builder, expect } = c;

    const results = await builder.readCollection(collection._id as Uuid);
    const node153c = results["153c"].data;
    const node2340 = results["2340"].data;

    expect(node153c._id).toBe(collection._id);
    expect(node2340._id).toBe(collection._id);
    expect(node153c.count).toBeGreaterThanOrEqual(0);
    expect(node2340.count).toBeGreaterThanOrEqual(0);
  });

  test("tail data", async ({ c }) => {
    const { builder, expect } = c;

    const results = await builder.tailData(collection._id as Uuid, 5);
    const node153c = results["153c"].data;
    const node2340 = results["2340"].data;

    expect(node153c).toHaveLength(1);
    expect(node2340).toHaveLength(1);
    expect(node153c.at(0)?.name).toBe("tim");
    expect(node2340.at(0)?.name).toBe("tim");
  });

  test("create and run query", async ({ c }) => {
    const { builder, expect } = c;

    // First create the query
    query.collection = collection._id;
    const createResults = await builder.createQuery(query);

    expect(Object.keys(createResults)).toHaveLength(2);
    // createQuery returns a string response, so we just verify the call succeeds
    expect(createResults["153c"]).toBeDefined();
    expect(createResults["2340"]).toBeDefined();

    // Run the query
    const runResults = await builder.runQuery({
      _id: query._id,
      variables: { name: "tim" },
    });
    const runs = Object.entries(runResults).reduce(
      (acc, [name, value]) => {
        acc[name] = value.data as Uuid;
        return acc;
      },
      {} as ByNodeName<Uuid>,
    );

    const results = await waitForQueryRun(c, runs);
    const node153c = results["153c"].data;
    const node2340 = results["2340"].data;

    expect(node153c.result).toEqual(node2340.result);
  });
});
