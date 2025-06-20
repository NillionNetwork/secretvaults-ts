import * as crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import { describe } from "vitest";
import type { Uuid } from "#/common/types";
import collectionJson from "./data/owned.collection.json";
import queryJson from "./data/owned.query.json";
import { createFixture } from "./fixture/fixture";

describe("clients.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture();

  collectionJson._id = crypto.randomUUID().toString() as Uuid;
  queryJson._id = crypto.randomUUID().toString() as Uuid;

  beforeAll(async (_c) => {});
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

      const result = builder.register({
        name: faker.company.name(),
        did: builder.did.toString(),
      });

      await expect(result).to.resolves.toBeUndefined();
    });

    test("read profile", async ({ c }) => {
      const { builder, expect } = c;

      const results = await builder.readBuilderProfile();
      const pairs = Object.entries(results);

      expect(Object.keys(results)).toHaveLength(2);
      for (const [_node, profile] of pairs) {
        expect(profile.data._id).toBe(builder.did.toString());
      }
    });
  });
});
