import * as crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import { describe } from "vitest";
import { pause } from "#/common/utils";
import type { CreateCollectionRequest } from "#/dto/collections.dto";
import type { ByNodeName, DidString } from "#/dto/common";
import collection from "./data/standard.collection.json";
import query from "./data/standard.query.json";
import { createFixture } from "./fixture/fixture";
import { waitForQueryRun } from "./fixture/utils";

describe("standard-data.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture({
    activateBuilderSubscription: true,
    keepDbs: false,
  });

  collection._id = crypto.randomUUID().toString();
  query._id = crypto.randomUUID().toString();

  let data: Array<{ _id: string; name: string }>;

  let nildbAId: DidString;
  let nildbBId: DidString;

  beforeAll(async (c) => {
    const { builder } = c;

    await builder.register({
      did: builder.did.didString,
      name: faker.company.name(),
    });

    nildbAId = builder.nodes.at(0)?.id.didString!;
    nildbBId = builder.nodes.at(1)?.id.didString!;
  });
  afterAll(async (_c) => {});

  test("create a standard collection", async ({ c }) => {
    const { builder, expect } = c;

    await builder.createCollection(collection as CreateCollectionRequest);

    // pause to avoid race condition
    await pause(1000);

    const result = await builder.readProfile();
    expect(result.data.collections).toHaveLength(1);
    expect(result.data.collections.at(0)).toBe(collection._id);
  });

  test("upload data", async ({ c }) => {
    const { builder, expect } = c;

    data = [
      {
        _id: crypto.randomUUID().toString(),
        name: "a",
      },
    ];

    const results = await builder.createStandardData({
      body: {
        collection: collection._id,
        data,
      },
    });
    const pairs: [string, any][] = Object.entries(results);

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
    const result = await builder.readCollection(collection._id);
    expect(result.data._id).toBe(collection._id);
    expect(result.data.count).toBeGreaterThanOrEqual(0);
    expect(result.data.schema).toEqual(collection.schema);

    const schema = result.data.schema as any;
    expect(schema.$schema).toBe(collection.schema.$schema);
    expect(schema.type).toBe(collection.schema.type);
    expect(schema.uniqueItems).toBe(collection.schema.uniqueItems);
    expect(schema.items).toBeDefined();
    expect(schema.items.type).toBe(collection.schema.items.type);
    expect(schema.items.properties).toBeDefined();
    expect(schema.items.properties._id).toEqual({
      type: "string",
      format: "uuid",
    });
    expect(schema.items.required).toEqual(collection.schema.items.required);
  });

  test("tail data", async ({ c }) => {
    const { builder, expect } = c;

    const results = await builder.tailData(collection._id, 5);
    expect(results.data).toHaveLength(1);
    expect(results.data.at(0)?.name).toBe("a");
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
    const runs = Object.keys(runResults).reduce(
      (acc, id) => {
        acc[id] = runResults[id].data;
        return acc;
      },
      {} as ByNodeName<string>,
    );

    const results = await waitForQueryRun(c, runs);
    const node153c = results[nildbAId].data;
    const node2340 = results[nildbBId].data;

    expect(node153c.result).toEqual(node2340.result);
  });

  test("get queries list and individual query", async ({ c }) => {
    const { builder, expect } = c;

    // Test getQueries() - should return list of queries
    const queriesList = await builder.getQueries();

    // Should have results from both nodes
    expect(Object.keys(queriesList)).toHaveLength(2);
    expect(queriesList[nildbAId]).toBeDefined();
    expect(queriesList[nildbBId]).toBeDefined();

    // Check that we have at least one query (the one created in previous test)
    const nodeAQueries = queriesList[nildbAId].data;
    expect(nodeAQueries).toBeDefined();
    expect(Array.isArray(nodeAQueries)).toBe(true);
    expect(nodeAQueries.length).toBeGreaterThan(0);

    // Verify the query summary has expected fields
    const queryFromList = nodeAQueries.find((q) => q._id === query._id);
    expect(queryFromList).toBeDefined();
    expect(queryFromList?._id).toBe(query._id);
    expect(queryFromList?.name).toBe(query.name);
    expect(queryFromList?.collection).toBe(collection._id);

    // Test getQuery() - should return single query
    const singleQuery = await builder.getQuery(query._id);

    // Should have results from both nodes
    expect(Object.keys(singleQuery)).toHaveLength(2);
    expect(singleQuery[nildbAId]).toBeDefined();
    expect(singleQuery[nildbBId]).toBeDefined();

    // Verify the query details
    const queryDetails = singleQuery[nildbAId].data;
    expect(queryDetails._id).toBe(query._id);
    expect(queryDetails.name).toBe(query.name);
    expect(queryDetails.collection).toBe(collection._id);
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
