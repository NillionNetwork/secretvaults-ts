import { faker } from "@faker-js/faker";
import { Keypair, NucTokenBuilder } from "@nillion/nuc";
import { describe } from "vitest";
import type { SecretVaultBuilderClient } from "#/builder-client";
import { NucCmd } from "#/common/nuc-cmd";
import { intoSecondsFromNow } from "#/common/time";
import type { Uuid } from "#/common/types";
import type { CreateCollectionRequest } from "#/dto/collections.dto";
import { createSecretVaultBuilderClient } from "#/factory";
import collection from "./data/owned.collection.json";
import query from "./data/owned.query.json";
import { createFixture } from "./fixture/fixture";
import { delay } from "./fixture/utils";

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
      did: builder.did.toString(),
      name: faker.company.name(),
    });

    otherBuilder = await createSecretVaultBuilderClient({
      keypair: Keypair.generate(),
      urls: env.urls,
    });

    await payer.nilauth.payAndValidate(
      otherBuilder.keypair.publicKey("hex"),
      "nildb",
    );
    await otherBuilder.refreshRootToken();

    await otherBuilder.register({
      did: otherBuilder.did.toString(),
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

    const results = await user.createData(delegation, {
      owner: user.did.toString(),
      acl: {
        grantee: builder.did.toString(),
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

  test("user can grant access to their data", async ({ c }) => {
    const { user, expect } = c;

    // grant access to otherBuilder
    await user.grantAccess({
      collection: collection._id,
      document: record._id,
      acl: {
        grantee: otherBuilder.did.toString(),
        read: true,
        write: false,
        execute: false,
      },
    });

    // retrieve data record to check access was added
    const dataResults = await user.readData({
      collection: collection._id,
      document: record._id,
    });

    const node153c = dataResults["153c"].data;
    const node2340 = dataResults["2340"].data;

    const otherBuilderAcl153c = node153c._acl.find(
      (acl) => acl.grantee === otherBuilder.did.toString(),
    );
    const otherBuilderAcl2340 = node2340._acl.find(
      (acl) => acl.grantee === otherBuilder.did.toString(),
    );

    expect(otherBuilderAcl153c).toBeDefined();
    expect(otherBuilderAcl153c!.read).toBe(true);
    expect(otherBuilderAcl153c!.write).toBe(false);
    expect(otherBuilderAcl153c!.execute).toBe(false);

    expect(otherBuilderAcl2340).toBeDefined();
    expect(otherBuilderAcl2340!.read).toBe(true);
    expect(otherBuilderAcl2340!.write).toBe(false);
    expect(otherBuilderAcl2340!.execute).toBe(false);
  });

  // test("other builder can access user data with delegation", async ({ c }) => {
  //   const { builder, user, expect } = c;
  //
  //   const delegation = NucTokenBuilder.extending(builder.rootToken)
  //     .command(NucCmd.nil.db.data.read)
  //     .audience(otherBuilder.did)
  //     .expiresAt(intoSecondsFromNow(60))
  //     .build(builder.keypair.privateKey());
  //
  //   const delegationEnvelope = NucTokenEnvelopeSchema.parse(delegation);

  // const invocation = NucTokenBuilder
  //   .invocation(delegationEnvelope)
  //   .build(otherBuilder);
  // });

  test("user can revoke access to their data", async ({ c }) => {
    const { user, expect } = c;

    // First grant access to have something to revoke
    await user.grantAccess({
      collection: collection._id,
      document: record._id,
      acl: {
        grantee: otherBuilder.did.toString(),
        read: true,
        write: true,
        execute: false,
      },
    });

    // revoke access to otherBuilder
    await user.revokeAccess({
      grantee: otherBuilder.did.toString(),
      collection: collection._id,
      document: record._id,
    });

    // retrieve data record to check access was removed
    const results = await user.readData({
      collection: collection._id,
      document: record._id,
    });

    const node153c = results["153c"].data;
    const node2340 = results["2340"].data;

    const otherBuilderAcl153c = node153c._acl.find(
      (acl) => acl.grantee === otherBuilder.did.toString(),
    );
    const otherBuilderAcl2340 = node2340._acl.find(
      (acl) => acl.grantee === otherBuilder.did.toString(),
    );

    expect(otherBuilderAcl153c).toBeUndefined();
    expect(otherBuilderAcl2340).toBeUndefined();
  });

  test("user can delete their data", async ({ c }) => {
    const { user, expect } = c;

    // delete data record
    await user.deleteData({
      collection: collection._id,
      document: record._id,
    });

    // retrieve references to validate deletion
    const results = await user.listDataReferences();
    expect(results["153c"].data).toHaveLength(0);
    expect(results["2340"].data).toHaveLength(0);
  });
});
