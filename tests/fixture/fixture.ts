import { SecretVaultBuilderClient } from "#/builder";
import { SecretVaultUserClient } from "#/user";
import { MongoClient } from "mongodb";
import type { Logger } from "pino";
import * as vitest from "vitest";

import { NilauthClient } from "@nillion/nilauth-client";
import { Signer } from "@nillion/nuc";

import { type EvmPayer, createEvmPayerFromEnv } from "./evm-payer";
import { createTestLogger } from "./utils";

/**
 *
 */
export type FixtureContext = {
  env: {
    urls: {
      ethereum: string;
      auth: string;
      dbs: string[];
    };
    chainId: number;
  };
  log: Logger;
  payer: {
    nilauth: NilauthClient;
    evm: EvmPayer;
    signer: Signer;
  };
  builder: SecretVaultBuilderClient;
  user: SecretVaultUserClient;
  expect: vitest.ExpectStatic;
  db: MongoClient;
};

/**
 *
 */
type TestFixtureExtension = {
  it: vitest.TestAPI<{ c: FixtureContext }>;
  test: vitest.TestAPI<{ c: FixtureContext }>;
  beforeAll: (fn: (c: FixtureContext) => Promise<void>) => void;
  afterAll: (fn: (c: FixtureContext) => Promise<void>) => void;
};

/**
 *
 */
type CreateFixtureOptions = {
  activateBuilderSubscription: boolean;
  keepDbs: boolean;
};

/**
 *
 */
export function createFixture(
  options: CreateFixtureOptions = {
    activateBuilderSubscription: true,
    keepDbs: false,
  },
): TestFixtureExtension {
  let fixture: FixtureContext | null = null;

  const it = vitest.test.extend<{ c: FixtureContext }>({
    c: async ({ expect }, use) => {
      const ctx: FixtureContext = {
        ...fixture!,
        expect,
      };

      await use(ctx);
    },
  });

  const beforeAll = (fn: (c: FixtureContext) => Promise<void>): void =>
    vitest.beforeAll(async () => {
      try {
        fixture = await buildContext(options);
        await fn(fixture);
      } catch (cause) {
        // Fallback to `process.stderr` to ensure fixture setup failures are logged during suite setup/teardown
        process.stderr.write("***\n");
        process.stderr.write("Critical: Fixture setup failed, stopping test run\n");
        process.stderr.write(`${String(cause)}\n`);
        process.stderr.write("***\n");
        throw new Error("Critical: Fixture setup failed, stopping test run", {
          cause,
        });
      }
    });

  const afterAll = (fn: (c: FixtureContext) => Promise<void>): void =>
    vitest.afterAll(async () => {
      if (!fixture) {
        // Fallback to `process.stderr` to ensure fixture setup failures are logged during suite setup/teardown
        process.stderr.write("Fixture not initialized, skipping 'afterAll' hook\n");
        return;
      }

      const dbClient = fixture.db;

      if (!options.keepDbs) {
        // If infra is left running then nildb migrate won't run between test suite runs so in some instances we need to
        // drop records rather than dbs

        fixture.log.info("Tidying databases");

        const instanceDbPrefix = ["nildb-1", "nildb-2"];
        const collections = ["builders", "collections", "queries", "query_runs", "users"];

        for (const instanceDbName of instanceDbPrefix) {
          const promises = collections.map(async (collection) => {
            await dbClient.db(instanceDbName).collection(collection).deleteMany({});
          });
          await Promise.all(promises);

          // We can drop the data dbs since they are re-created on collection creation requests
          await dbClient.db(`${instanceDbName}_data`).dropDatabase();
        }
      }
      await dbClient.close(true);
      await fn(fixture);
    });

  return { beforeAll, afterAll, it, test: it };
}

/**
 *
 */
async function buildContext(options: CreateFixtureOptions): Promise<FixtureContext> {
  const nildbNodesUrls = process.env.APP_NILDB_NODES.split(",");
  const nilauthUrl = process.env.APP_NILAUTH_BASE_URL;
  const mongodbUri = process.env.APP_MONGODB_URI;
  const ethereumRpcUrl = process.env.APP_ETHEREUM_RPC_URL;
  const chainId = Number(process.env.APP_CHAIN_ID);
  const payerPrivateKey = process.env.APP_PAYER_PRIVATE_KEY;

  const log = createTestLogger();
  const db = await MongoClient.connect(mongodbUri);

  // create the secret vault user client
  const user = await SecretVaultUserClient.from({
    baseUrls: nildbNodesUrls,
    signer: Signer.generate(),
  });

  // Create NilauthClient with chainId (new Ethereum-based API)
  const nilauth = await NilauthClient.create({
    baseUrl: nilauthUrl,
    chainId,
  });

  // Create EVM payer for subscription payments
  const evmPayer = createEvmPayerFromEnv();

  // Create a signer for the payer (derived from the same private key, without 0x prefix)
  const payerSigner = Signer.fromPrivateKey(payerPrivateKey.replace("0x", ""));

  const builderSigner = Signer.generate();
  const builder = await SecretVaultBuilderClient.from({
    signer: builderSigner,
    dbs: nildbNodesUrls,
    nilauthClient: nilauth,
  });

  if (options.activateBuilderSubscription) {
    const builderDid = await builder.getDid();
    log.info({ did: builderDid.didString }, "Paying for builder subscription");
    await evmPayer.payForSubscription(nilauth, payerSigner, builderDid, "nildb");
    await builder.refreshRootToken();
  }

  return {
    env: {
      urls: {
        ethereum: ethereumRpcUrl,
        auth: nilauthUrl,
        dbs: nildbNodesUrls,
      },
      chainId,
    },
    log,
    payer: {
      nilauth,
      evm: evmPayer,
      signer: payerSigner,
    },
    builder,
    user,
    db,
    // this expect gets replaced by the test's for better failure localization
    expect: vitest.expect,
  };
}
