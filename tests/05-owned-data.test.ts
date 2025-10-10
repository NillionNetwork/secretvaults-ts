import { faker } from "@faker-js/faker";
import { Builder, type Command, NilauthClient, Signer } from "@nillion/nuc";
import { describe } from "vitest";
import { SecretVaultBuilderClient } from "#/builder";
import { NucCmd } from "#/common/nuc-cmd";
import { intoSecondsFromNow, pause } from "#/common/utils";
import type { CreateCollectionRequest } from "#/dto/collections.dto";
import collection from "./data/owned.collection.json";
import query from "./data/owned.query.json";
import { createFixture } from "./fixture/fixture";

describe("owned-data.test.ts", () => {
  const { test, beforeAll, afterAll } = createFixture();

  collection._id = faker.string.uuid();
  query._id = faker.string.uuid();
  const record = {
    _id: faker.string.uuid(),
    name: faker.person.fullName(),
  };

  let otherBuilder: SecretVaultBuilderClient;

  beforeAll(async (c) => {
    const { builder, env, payer, log } = c;

    await builder.register({
      did: (await builder.getDid()).didString,
      name: faker.company.name(),
    });

    const otherBuilderSigner = Signer.generate();
    const otherNilauth = await NilauthClient.create({
      baseUrl: env.urls.auth,
    });
    otherBuilder = await SecretVaultBuilderClient.from({
      signer: otherBuilderSigner,
      dbs: env.urls.dbs,
      nilauthClient: otherNilauth,
    });

    const otherBuilderDid = await otherBuilder.getDid();
    log.info(
      { did: otherBuilderDid.didString },
      "Paying for otherBuilder subscription",
    );
    await payer.nilauth.payAndValidate(
      Signer.fromPrivateKey(process.env.APP_NILCHAIN_PRIVATE_KEY_0!),
      otherBuilderDid,
      "nildb",
    );
    await otherBuilder.refreshRootToken();

    await otherBuilder.register({
      did: otherBuilderDid.didString,
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

  test("read owned collection metadata with schema", async ({ c }) => {
    const { builder, expect } = c;

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

  test("user can upload data", async ({ c }) => {
    const { builder, user, expect } = c;

    const userDid = await user.getDid();
    const builderDid = await builder.getDid();

    const delegation = await Builder.delegationFrom(builder.rootToken)
      .command(NucCmd.nil.db.data.create as Command)
      .audience(userDid)
      .expiresAt(intoSecondsFromNow(60))
      .signAndSerialize(builder.signer);

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
      { auth: { delegation } },
    );
    const pairs = Object.entries(results);
    expect(Object.keys(pairs)).toHaveLength(2);

    for (const [_node, result] of pairs) {
      expect(result.data.errors).toHaveLength(0);
      expect(result.data.created.at(0)).toBe(record._id);
    }
  });

  test("user can list data references with default pagination", async ({
    c,
  }) => {
    const { user, expect } = c;

    const result = await user.listDataReferences();
    expect(result.data).toHaveLength(1);
    expect(result.data.at(0)?.document).toBe(record._id);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.limit).toBe(25);
    expect(result.pagination.offset).toBe(0);
  });

  test("user can list data references with explicit pagination", async ({
    c,
  }) => {
    const { user, builder, expect } = c;

    const userDid = await user.getDid();
    const builderDid = await builder.getDid();

    // Create more data to test pagination
    const delegation = await Builder.delegationFrom(builder.rootToken)
      .command(NucCmd.nil.db.data.create as Command)
      .audience(userDid)
      .expiresAt(intoSecondsFromNow(60))
      .signAndSerialize(builder.signer);

    const moreData = Array.from({ length: 5 }, () => ({
      _id: faker.string.uuid(),
      name: faker.person.fullName(),
    }));

    await user.createData(
      {
        owner: userDid.didString,
        acl: {
          grantee: builderDid.didString,
          read: true,
          write: false,
          execute: false,
        },
        collection: collection._id,
        data: moreData,
      },
      { auth: { delegation } },
    );

    const result = await user.listDataReferences({
      pagination: { limit: 2, offset: 1 },
    });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(6);
    expect(result.pagination.limit).toBe(2);
    expect(result.pagination.offset).toBe(1);
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

    const otherBuilderDid = await otherBuilder.getDid();

    // grant access to otherBuilder
    await user.grantAccess({
      collection: collection._id,
      document: record._id,
      acl: {
        grantee: otherBuilderDid.didString,
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
      (acl) => acl.grantee === otherBuilderDid.didString,
    );

    expect(otherBuilderAcl).toBeDefined();
    expect(otherBuilderAcl!.read).toBe(true);
    expect(otherBuilderAcl!.write).toBe(false);
    expect(otherBuilderAcl!.execute).toBe(false);
  });

  test("user can revoke access to their data", async ({ c }) => {
    const { user, expect } = c;

    const otherBuilderDid = await otherBuilder.getDid();

    // First grant access to have something to revoke
    await user.grantAccess({
      collection: collection._id,
      document: record._id,
      acl: {
        grantee: otherBuilderDid.didString,
        read: true,
        write: true,
        execute: false,
      },
    });

    // revoke access to otherBuilder
    await user.revokeAccess({
      grantee: otherBuilderDid.didString,
      collection: collection._id,
      document: record._id,
    });

    // retrieve data record to check access was removed
    const result = await user.readData({
      collection: collection._id,
      document: record._id,
    });

    const otherBuilderAcl = result.data._acl.find(
      (acl) => acl.grantee === otherBuilderDid.didString,
    );
    expect(otherBuilderAcl).toBeUndefined();
  });

  test("user can read their profile", async ({ c }) => {
    const { user, expect } = c;
    const result = await user.readProfile();

    expect(result.data._id).toBe((await user.getDid()).didString);
    // Profile contains logs from all operations in test suite
    // Including: create-data (1 + 5), auth (2)
    expect(result.data.logs.length).toBeGreaterThanOrEqual(5);
    expect(result.data.data).toHaveLength(6);
  });

  test("user can delete their data", async ({ c }) => {
    const { user, expect, db } = c;

    // Get all user data references
    const allDataRefs = await user.listDataReferences();
    expect(allDataRefs.data).toHaveLength(6);

    // Delete all data records
    for (const ref of allDataRefs.data) {
      await user.deleteData({
        collection: ref.collection,
        document: ref.document,
      });
    }

    // Since we deleted all user's records, the user should have been removed from the db
    const users = await db.db("nildb-1").collection("users").find({}).toArray();
    expect(users).toHaveLength(0);
  });
});
