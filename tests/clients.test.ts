import * as crypto from "node:crypto";
import { faker } from "@faker-js/faker";
import { describe } from "vitest";
import type { DidString } from "#/dto/common";
import collectionJson from "./data/owned.collection.json";
import queryJson from "./data/owned.query.json";
import { createFixture } from "./fixture/fixture";

describe("clients.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture();

  collectionJson._id = crypto.randomUUID().toString();
  queryJson._id = crypto.randomUUID().toString();

  let nildbAId: DidString;
  let nildbBId: DidString;

  beforeAll(async (c) => {
    const { builder } = c;

    nildbAId = builder.nodes.at(0)?.id.didString! as DidString;
    nildbBId = builder.nodes.at(1)?.id.didString! as DidString;
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
        did: builder.did.didString,
      });

      const nildbA = results[nildbAId]!;
      const nildbB = results[nildbBId]!;

      expect(nildbA).toEqual("");
      expect(nildbB).toEqual("");
    });

    test("read profile", async ({ c }) => {
      const { builder, expect } = c;

      const { data: profile } = await builder.readProfile();
      expect(profile._id).toBe(builder.did.didString);
    });
  });
});
