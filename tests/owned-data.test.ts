import { faker } from "@faker-js/faker";
import { NucTokenBuilder } from "@nillion/nuc";
import { describe } from "vitest";
import { NucCmd } from "#/common/nuc-cmd";
import { intoSecondsFromNow } from "#/common/time";
import type { Uuid } from "#/common/types";
import type { CreateCollectionRequest } from "#/dto/collections.dto";
import collection from "./data/owned.collection.json";
import query from "./data/owned.query.json";
import { createFixture } from "./fixture/fixture";
import { delay } from "./fixture/utils";

describe("owned-data.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture({
    activateBuilderSubscription: true,
    keepDbs: true,
  });

  collection._id = faker.string.uuid() as Uuid;
  query._id = faker.string.uuid() as Uuid;
  const record = {
    _id: faker.string.uuid(),
    name: faker.person.fullName(),
  };

  beforeAll(async (c) => {
    const { builder } = c;

    await builder.register({
      did: builder.did.toString(),
      name: faker.company.name(),
    });
  });
  afterAll(async (_c) => {});

  test("create owned collection", async ({ c }) => {
    const { builder, expect } = c;

    const _results = await builder.createCollection(
      collection as CreateCollectionRequest,
    );

    // pause to avoid race condition
    await delay(1000);

    const results = await builder.readBuilderProfile();
    const pairs = Object.entries(results);
    for (const [_node, result] of pairs) {
      expect(result.data.collections).toHaveLength(1);
      expect(result.data.collections.at(0)).toBe(collection._id);
    }
  });

  test("user can upload data", async ({ c }) => {
    const { builder, user, expect } = c;

    const delegation = NucTokenBuilder.extending(builder.rootToken)
      .command(NucCmd.nil.db.data.create)
      .audience(user.did)
      .expiresAt(intoSecondsFromNow(60))
      .build(builder.keypair.privateKey());

    const results = await user.createData({
      delegation,
      body: {
        owner: user.did.toString(),
        acl: {
          grantee: builder.did.toString(),
          read: true,
          write: false,
          execute: true,
        },
        collection: collection._id,
        data: [record],
      },
    });
    const pairs = Object.entries(results);
    expect(Object.keys(pairs)).toHaveLength(2);

    for (const [_node, result] of pairs) {
      expect(result.data.errors).toHaveLength(0);
      expect(result.data.created.at(0)).toBe(record._id);
    }
  });

  test("user can list data references", async ({ c }) => {
    const { user, expect } = c;

    const results = await user.listDataReferences();

    const node153c = results["153c"].data!;
    const node2340 = results["2340"].data!;
    expect(node153c).toEqual(node2340);
  });

  test("user can retrieve their own data by id", async ({ c }) => {
    const { user, expect } = c;

    const results = await user.readData({
      collection: collection._id,
      document: record._id,
    });

    const node153c = results["153c"].data;
    const node2340 = results["2340"].data;

    expect(node153c.name).toEqual(record.name);
    expect(node2340.name).toEqual(record.name);
  });
});
