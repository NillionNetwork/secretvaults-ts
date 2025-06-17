import { beforeAll, describe, test } from "vitest";
import {
  createNilDbBuilderClient,
  type NilDbBuilderClient,
} from "#/nildb/builder-client";

describe("builder-client.test.ts", () => {
  const options = {
    baseUrl: process.env.APP_NILDB_NODES.split(",").at(0)!,
  };

  let client: NilDbBuilderClient;

  beforeAll(async () => {
    client = await createNilDbBuilderClient(options);
  });

  test.skip("health check", async ({ expect }) => {
    // Literal OK not in current nildb image
    const health = await client.healthCheck();
    expect(health).toBe("OK");
  });

  test("about node", async ({ expect }) => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 5000));

    const about = await client.aboutNode();
    expect(about).toHaveProperty("public_key");
  });
});
