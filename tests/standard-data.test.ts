import * as crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import { describe } from "vitest";
import type { ByNodeName, Did, Uuid } from "#/common/types";
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

  let nildbAId: Did;
  let nildbBId: Did;

  beforeAll(async (c) => {
    const { builder } = c;

    await builder.register({
      did: builder.did.toString() as Did,
      name: faker.company.name(),
    });

    nildbAId = builder.nodes.at(0)?.id.toString()! as Did;
    nildbBId = builder.nodes.at(1)?.id.toString()! as Did;
  });
  afterAll(async (_c) => {});

  test("create a standard collection", async ({ c }) => {
    const { builder, expect } = c;

    await builder.createCollection(collection as CreateCollectionRequest);

    // pause to avoid race condition
    await delay(1000);

    const result = await builder.readProfile();
    expect(result.data.collections).toHaveLength(1);
    expect(result.data.collections.at(0)).toBe(collection._id);
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

    const result = await builder.readProfile();
    expect(result.data.collections).toHaveLength(1);
    expect(result.data.collections.at(0)).toBe(collection._id);
  });

  test("update builder profile", async ({ c }) => {
    const { builder, expect } = c;

    const updatedName = faker.company.name();
    await builder.updateBuilderProfile({ name: updatedName });

    const result = await builder.readProfile();
    expect(result.data.name).toBe(updatedName);
  });

  test("read collection metadata", async ({ c }) => {
    const { builder, expect } = c;

    // The method now returns a single, unified response.
    const result = await builder.readCollection(collection._id as Uuid);
    expect(result.data._id).toBe(collection._id);
    expect(result.data.count).toBeGreaterThanOrEqual(0);
  });

  test("tail data", async ({ c }) => {
    const { builder, expect } = c;

    const results = await builder.tailData(collection._id as Uuid, 5);
    expect(results.data).toHaveLength(1);
    expect(results.data.at(0)?.name).toBe("tim");
  });

  test("create and run query", async ({ c }) => {
    const { builder, expect } = c;

    query.collection = collection._id;
    const createResults = await builder.createQuery(query);

    expect(Object.keys(createResults)).toHaveLength(2);
    expect(createResults[nildbAId]).toBeDefined();
    expect(createResults[nildbBId]).toBeDefined();

    // runQuery still returns ByNodeName, so this part is correct.
    const runResults = await builder.runQuery({
      _id: query._id,
      variables: { name: "tim" },
    });
    const runs = Object.entries(runResults).reduce(
      (acc, [id, value]) => {
        acc[id as Did] = value.data as Uuid;
        return acc;
      },
      {} as ByNodeName<Uuid>,
    );

    const results = await waitForQueryRun(c, runs);
    const node153c = results[nildbAId].data;
    const node2340 = results[nildbBId].data;

    expect(node153c.result).toEqual(node2340.result);
  });

  test("builder can delete their account", async ({ c }) => {
    const { builder, expect, db } = c;

    const result = await builder.deleteBuilder();

    expect(result[nildbAId]).toEqual("");
    expect(result[nildbBId]).toEqual("");

    const builders = await db
      .db("nildb-1")
      .collection("builders")
      .find({})
      .toArray();
    expect(builders).toHaveLength(0);

    const dataCollections = await db.db("nildb-1_data").collections();
    expect(dataCollections).toHaveLength(0);
  });
});
