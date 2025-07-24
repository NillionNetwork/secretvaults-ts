import { Keypair, NilauthClient, PayerBuilder } from "@nillion/nuc";
import { MongoClient } from "mongodb";
import type { Logger } from "pino";
import * as vitest from "vitest";
import { SecretVaultBuilderClient } from "#/builder";
import { SecretVaultUserClient } from "#/user";
import { createTestLogger } from "./utils";

/**
 *
 */
export type FixtureContext = {
  env: {
    urls: {
      chain: string;
      auth: string;
      dbs: string[];
    };
  };
  log: Logger;
  payer: {
    nilauth: NilauthClient;
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

  const beforeAll = (fn: (c: FixtureContext) => Promise<void>) =>
    vitest.beforeAll(async () => {
      try {
        fixture = await buildContext(options);
        await fn(fixture);
      } catch (cause) {
        // Fallback to `process.stderr` to ensure fixture setup failures are logged during suite setup/teardown
        process.stderr.write("***\n");
        process.stderr.write(
          "Critical: Fixture setup failed, stopping test run\n",
        );
        process.stderr.write(`${cause}\n`);
        process.stderr.write("***\n");
        throw new Error("Critical: Fixture setup failed, stopping test run", {
          cause,
        });
      }
    });

  const afterAll = (fn: (c: FixtureContext) => Promise<void>) =>
    vitest.afterAll(async () => {
      if (!fixture) {
        // Fallback to `process.stderr` to ensure fixture setup failures are logged during suite setup/teardown
        process.stderr.write(
          "Fixture not initialized, skipping 'afterAll' hook\n",
        );
        return;
      }

      const dbClient = fixture.db;

      if (!options.keepDbs) {
        // If infra is left running then nildb migrate won't run between test suite runs so in some instances we need to
        // drop records rather than dbs

        fixture.log.info("Tidying databases");

        const instanceDbPrefix = ["nildb-1", "nildb-2"];
        const collections = [
          "builders",
          "collections",
          "queries",
          "query_runs",
          "users",
        ];

        for (const instanceDbName of instanceDbPrefix) {
          const promises = collections.map(async (collection) => {
            await dbClient
              .db(instanceDbName)
              .collection(collection)
              .deleteMany({});
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
async function buildContext(
  options: CreateFixtureOptions,
): Promise<FixtureContext> {
  const nildbNodesUrls = process.env.APP_NILDB_NODES.split(",");
  const secretKey = process.env.APP_NILCHAIN_PRIVATE_KEY_0;
  const nilchainUrl = process.env.APP_NILCHAIN_JSON_RPC;
  const nilauthUrl = process.env.APP_NILAUTH_BASE_URL;
  const mongodbUri = process.env.APP_MONGODB_URI;

  const log = createTestLogger();
  const db = await MongoClient.connect(mongodbUri);

  // create the secret vault user client
  const user = await SecretVaultUserClient.from({
    baseUrls: nildbNodesUrls,
    keypair: Keypair.generate(),
  });

  const builder = await SecretVaultBuilderClient.from({
    keypair: Keypair.generate(),
    urls: {
      chain: nilchainUrl,
      auth: nilauthUrl,
      dbs: nildbNodesUrls,
    },
    blindfold: {
      operation: "store",
    },
  });

  const payer = await new PayerBuilder()
    .keypair(Keypair.from(secretKey))
    .chainUrl(nilchainUrl)
    .build();
  const nilauth = await NilauthClient.from(nilauthUrl, payer);

  if (options.activateBuilderSubscription) {
    const publicKey = builder.keypair.publicKey("hex");
    log.info({ publicKey }, "Renewing subscription");
    await nilauth.payAndValidate(publicKey, "nildb");
    await builder.refreshRootToken();
  }

  return {
    env: {
      urls: {
        chain: nilchainUrl,
        auth: nilauthUrl,
        dbs: nildbNodesUrls,
      },
    },
    log,
    payer: {
      nilauth,
    },
    builder,
    user,
    db,
    // this expect gets replaced by the test's for better failure localization
    expect: vitest.expect,
  };
}
