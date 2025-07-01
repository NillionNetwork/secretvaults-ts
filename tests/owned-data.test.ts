import { faker } from "@faker-js/faker";
import { Keypair, NucTokenBuilder } from "@nillion/nuc";
import { describe } from "vitest";
import { SecretVaultBuilderClient } from "#/builder";
import { NucCmd } from "#/common/nuc-cmd";
import type { Did, Uuid } from "#/common/types";
import { intoSecondsFromNow, pause } from "#/common/utils";
import type { CreateCollectionRequest } from "#/dto/collections.dto";
import collection from "./data/owned.collection.json";
import query from "./data/owned.query.json";
import { createFixture } from "./fixture/fixture";

describe("owned-data.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture();

  collection._id = faker.string.uuid() as Uuid;
  query._id = faker.string.uuid() as Uuid;
  const record = {
    _id: faker.string.uuid(),
    name: faker.person.fullName(),
  };

  let otherBuilder: SecretVaultBuilderClient;

  beforeAll(async (c) => {
    const { builder, env, payer } = c;

    await builder.register({
      did: builder.did.toString() as Did,
      name: faker.company.name(),
    });

    otherBuilder = await SecretVaultBuilderClient.from({
      keypair: Keypair.generate(),
      urls: env.urls,
    });

    await payer.nilauth.payAndValidate(
      otherBuilder.keypair.publicKey("hex"),
      "nildb",
    );
    await otherBuilder.refreshRootToken();

    await otherBuilder.register({
      did: otherBuilder.did.toString() as Did,
      name: faker.company.name(),
    });
  });
  afterAll(async (_c) => {});

  test("create owned collection", async ({ c }) => {
    const { builder, expect } = c;

    await builder.createCollection(collection as CreateCollectionRequest);

    // pause to avoid race condition
    await pause(1000);

    // Assert against the single, unified response
    const result = await builder.readProfile();
    expect(result.data.collections).toHaveLength(1);
    expect(result.data.collections.at(0)).toBe(collection._id);
  });

  test("user can upload data", async ({ c }) => {
    const { builder, user, expect } = c;

    const delegation = NucTokenBuilder.extending(builder.rootToken)
      .command(NucCmd.nil.db.data.create)
      .audience(user.did)
      .expiresAt(intoSecondsFromNow(60))
      .build(builder.keypair.privateKey());

    const results = await user.createData(delegation, {
      owner: user.did.toString() as Did,
      acl: {
        grantee: builder.did.toString() as Did,
        read: true,
        write: false,
        execute: true,
      },
      collection: collection._id,
      data: [record],
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

    // Assert against the single, unified response
    const result = await user.listDataReferences();
    expect(result.data).toHaveLength(1);
    expect(result.data.at(0)?.document).toBe(record._id);
  });

  test("user can retrieve their own data by id", async ({ c }) => {
    const { user, expect } = c;

    // Assert against the single, unified response
    const result = await user.readData({
      collection: collection._id,
      document: record._id,
    });
    expect(result.data.name).toEqual(record.name);
  });

  test("user can grant access to their data", async ({ c }) => {
    const { user, expect } = c;

    // grant access to otherBuilder
    await user.grantAccess({
      collection: collection._id,
      document: record._id,
      acl: {
        grantee: otherBuilder.did.toString() as Did,
        read: true,
        write: false,
        execute: false,
      },
    });

    // retrieve data record to check access was added
    const dataResult = await user.readData({
      collection: collection._id,
      document: record._id,
    });

    // Assert against the single, unified response's ACL
    const otherBuilderAcl = dataResult.data._acl.find(
      (acl) => acl.grantee === otherBuilder.did.toString(),
    );

    expect(otherBuilderAcl).toBeDefined();
    expect(otherBuilderAcl!.read).toBe(true);
    expect(otherBuilderAcl!.write).toBe(false);
    expect(otherBuilderAcl!.execute).toBe(false);
  });

  test("user can revoke access to their data", async ({ c }) => {
    const { user, expect } = c;

    // First grant access to have something to revoke
    await user.grantAccess({
      collection: collection._id,
      document: record._id,
      acl: {
        grantee: otherBuilder.did.toString() as Did,
        read: true,
        write: true,
        execute: false,
      },
    });

    // revoke access to otherBuilder
    await user.revokeAccess({
      grantee: otherBuilder.did.toString() as Did,
      collection: collection._id,
      document: record._id,
    });

    // retrieve data record to check access was removed
    const result = await user.readData({
      collection: collection._id,
      document: record._id,
    });

    const otherBuilderAcl = result.data._acl.find(
      (acl) => acl.grantee === otherBuilder.did.toString(),
    );
    expect(otherBuilderAcl).toBeUndefined();
  });

  test("user can read their profile", async ({ c }) => {
    const { user, expect } = c;
    const result = await user.readProfile();

    expect(result.data._id).toBe(user.did.toString());
    expect(result.data.logs).toHaveLength(5);
  });

  test("user can delete their data", async ({ c }) => {
    const { user, expect, db } = c;

    // delete data record
    await user.deleteData({
      collection: collection._id,
      document: record._id,
    });

    // since it was the user's only record the user should have been removed from the db
    const users = await db.db("nildb-1").collection("users").find({}).toArray();
    expect(users).toHaveLength(0);
  });
});
