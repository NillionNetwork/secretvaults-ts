import { faker } from "@faker-js/faker";
import { Builder, type Command } from "@nillion/nuc";
import { describe } from "vitest";
import { NucCmd } from "#/common/nuc-cmd";
import { intoSecondsFromNow } from "#/common/utils";
import type { CreateCollectionRequest } from "#/dto/collections.dto";
import type { CreateOwnedDataRequest } from "#/dto/data.dto";
import collection from "./data/owned.collection.json";
import { createFixture } from "./fixture/fixture";

describe("auth-context.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture();

  collection._id = faker.string.uuid();

  beforeAll(async (c) => {
    const { builder } = c;

    await builder.register({
      did: (await builder.getDid()).didString,
      name: faker.company.name(),
    });

    await builder.createCollection(collection as CreateCollectionRequest);
  });

  afterAll(async (_c) => {});

  test("builder can use `invocations` map to auth request", async ({ c }) => {
    const { builder, expect } = c;

    // 1. Pre-mint invocations for each node in the cluster
    const invocations: Record<string, string> = {};
    for (const node of builder.nodes) {
      invocations[node.id.didString] = await Builder.invocationFrom(
        builder.rootToken,
      )
        .audience(node.id)
        .command(NucCmd.nil.db.builders.read as Command)
        .signAndSerialize(builder.signer);
    }

    // 2. Pass the map to the authenticated method
    const profile = await builder.readProfile({ auth: { invocations } });
    expect(profile.data._id).toBe((await builder.getDid()).didString);
  });

  test("user.createData throws error if auth context is missing", async ({
    c,
  }) => {
    const { user, expect } = c;
    const userDid = await user.getDid();

    const body: CreateOwnedDataRequest = {
      owner: userDid.didString,
      acl: {
        grantee: "any",
        read: true,
        write: false,
        execute: false,
      },
      collection: collection._id,
      data: [{ _id: faker.string.uuid(), name: "test" }],
    };

    await expect(user.createData(body)).rejects.toThrow(
      "The 'createData' operation requires an 'AuthContext' containing a delegation token from the collection's builder.",
    );
  });

  test("user.createData works with `invocations` map", async ({ c }) => {
    const { builder, user, expect } = c;
    const userDid = await user.getDid();
    const builderDid = await builder.getDid();

    const record = {
      _id: faker.string.uuid(),
      name: faker.person.fullName(),
    };

    // 1. Create the delegation that authorizes the user
    const delegation = await Builder.delegationFrom(builder.rootToken)
      .command(NucCmd.nil.db.data.create as Command)
      .audience(userDid)
      .expiresAt(intoSecondsFromNow(60))
      .signAndSerialize(builder.signer);

    // 2. Pre-mint an invocation for each node from that delegation
    const invocations: Record<string, string> = {};
    for (const node of user.nodes) {
      invocations[node.id.didString] = await Builder.invocationFromString(
        delegation,
      )
        .audience(node.id)
        .signAndSerialize(user.signer);
    }

    // 3. Call createData with the invocations map
    const results = await user.createData(
      {
        owner: userDid.didString,
        acl: {
          grantee: builderDid.didString,
          read: true,
          write: false,
          execute: true,
        },
        collection: collection._id,
        data: [record],
      },
      { auth: { invocations } },
    );

    const pairs = Object.entries(results);
    expect(Object.keys(pairs)).toHaveLength(2);

    for (const [_node, result] of pairs) {
      expect(result.data.errors).toHaveLength(0);
      expect(result.data.created.at(0)).toBe(record._id);
    }
  });
});
