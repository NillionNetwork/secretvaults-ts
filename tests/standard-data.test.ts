import * as crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import { describe } from "vitest";
import type { Uuid } from "#/common/types";
import type { CreateCollectionRequest } from "#/nildb/dto/collections.dto";
import collection from "./data/standard.collection.json";
import query from "./data/standard.query.json";
import { createFixture } from "./fixture/fixture";
import { delay } from "./fixture/utils";

describe("standard-data.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture({
    activateBuilderSubscription: true,
    keepDbs: false,
  });

  collection._id = crypto.randomUUID().toString() as Uuid;
  query._id = crypto.randomUUID().toString() as Uuid;

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

    const data = [
      {
        _id: crypto.randomUUID().toString(),
        name: "tim",
      },
    ];

    const results = await builder.createData({
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
});
