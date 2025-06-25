import * as crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import { describe } from "vitest";
import type { Did, Uuid } from "#/common/types";
import collectionJson from "./data/owned.collection.json";
import queryJson from "./data/owned.query.json";
import { createFixture } from "./fixture/fixture";

describe("clients.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture();

  collectionJson._id = crypto.randomUUID().toString() as Uuid;
  queryJson._id = crypto.randomUUID().toString() as Uuid;

  let nildbAId: Did;
  let nildbBId: Did;

  beforeAll(async (c) => {
    const { builder } = c;

    nildbAId = builder.nodes.at(0)?.id.toString()! as Did;
    nildbBId = builder.nodes.at(1)?.id.toString()! as Did;
  });
  afterAll(async (_c) => {});

  describe("user", () => {
    test("create client", async ({ c }) => {
      const { user, expect, env } = c;

      expect(user.nodes).toHaveLength(env.urls.dbs.length);
    });

    test("retrieve cluster information", async ({ c }) => {
      const { user, expect, env } = c;

      const results = await user.readClusterInfo();
      const pairs = Object.entries(results);

      expect(Object.keys(results)).toHaveLength(env.urls.dbs.length);
      for (const [_, aboutNode] of pairs) {
        expect(aboutNode).toHaveProperty("public_key");
      }
    });
  });

  describe("builder", () => {
    test("create client", async ({ c }) => {
      const { builder, expect, env } = c;
      expect(builder.nodes).toHaveLength(env.urls.dbs.length);
    });

    test("retrieve cluster information", async ({ c }) => {
      const { builder, expect, env } = c;

      const results = await builder.readClusterInfo();
      const pairs = Object.entries(results);

      expect(Object.keys(results)).toHaveLength(env.urls.dbs.length);

      for (const [_, aboutNode] of pairs) {
        expect(aboutNode).toHaveProperty("public_key");
      }
    });

    test("registration", async ({ c }) => {
      const { builder, expect } = c;

      const results = await builder.register({
        name: faker.company.name(),
        did: builder.did.toString() as Did,
      });

      const node153c = results[nildbAId]!;
      const node2340 = results[nildbBId]!;

      expect(node153c).toEqual("");
      expect(node2340).toEqual("");
    });

    test("read profile", async ({ c }) => {
      const { builder, expect } = c;

      const results = await builder.readBuilderProfile();
      const pairs = Object.entries(results);

      expect(Object.keys(results)).toHaveLength(2);
      for (const [_node, profile] of pairs) {
        expect(profile._id).toBe(builder.did.toString());
      }
    });
  });
});
