import * as crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import { NucTokenBuilder } from "@nillion/nuc";
import { describe } from "vitest";
import type { Uuid } from "#/common/types";
import type { CreateCollectionRequest } from "#/nildb/dto/collections.dto";
import { NucCmd } from "#/nildb/nuc-cmd";
import collection from "./data/owned.collection.json";
import query from "./data/owned.query.json";
import { createFixture } from "./fixture/fixture";
import { delay } from "./fixture/utils";

describe("owned-data.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture();

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

  test("create owned collection", async ({ c }) => {
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

  test("user can upload data", async ({ c }) => {
    const { builder, user, expect } = c;

    const delegation = NucTokenBuilder.extending(builder.rootToken)
      .command(NucCmd.nil.db.data.create)
      .audience(user.did)
      .expiresAt((Date.now() + 1000 * 60) / 1000)
      .build(builder._options.keypair.privateKey());

    const result = await user.createData({
      body: {
        owner: user.did.toString(),
        acl: {
          grantee: builder.did.toString(),
          read: true,
          write: false,
          execute: true,
        },
        collection: collection._id,
        data: [
          {
            _id: crypto.randomUUID().toString(),
            name: "tim",
          },
        ],
      },
      delegation,
    });

    console.log(result);

    expect(result).toBeDefined();
  });
});
