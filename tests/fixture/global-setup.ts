import dockerCompose from "docker-compose";
import { config } from "dotenv";
import type { TestProject } from "vitest/node";

const MAX_RETRIES = 300;
const composeOptions = {
  cwd: "./tests/fixture/docker",
  composeOptions: [["--project-name", "secretvaults-tests"]],
};

export async function setup(_project: TestProject): Promise<void> {
  console.log("🚀 Starting containers...");
  config({ path: ".env.test" });

  try {
    // Check if containers are already running
    const psResult = await dockerCompose.ps(composeOptions);
    const allServicesUp =
      psResult.data.services?.length > 0 && psResult.data.services.every((service) => service.state?.includes("Up"));

    if (allServicesUp) {
      console.log("✅ Containers already running, skipping startup.");
      return;
    }

    console.log("Waiting for services to become healthy...");
    await dockerCompose.upAll(composeOptions);

    const nildbUrls = process.env.APP_NILDB_NODES.split(",").map((url) => url.replace("localhost", "127.0.0.1"));
    const nilauthUrl = process.env.APP_NILAUTH_BASE_URL!.replace("localhost", "127.0.0.1");

    const healthChecks = [
      ...nildbUrls.map((url) => retry(() => checkServiceHealth(url), url)),
      retry(() => checkServiceHealth(nilauthUrl), nilauthUrl),
    ];

    await Promise.all(healthChecks);

    console.log("✅ All services are healthy. Containers started successfully.");
  } catch (error) {
    console.error("❌ Error starting containers: ", error);
    process.exit(1);
  }
}

export async function teardown(_project: TestProject): Promise<void> {
  // Skip teardown if KEEP_INFRA environment variable is set
  if (process.env.KEEP_INFRA === "true") {
    console.log("🔄 Keeping infrastructure running as KEEP_INFRA=true");
    return;
  }

  console.log("🛑 Removing containers...");
  try {
    await dockerCompose.downAll(composeOptions);
    console.log("✅ Containers removed successfully.");
  } catch (error) {
    console.error("❌ Error removing containers: ", error);
    process.exit(1);
  }
}

async function checkServiceHealth(url: string): Promise<boolean> {
  try {
    const aboutUrl = new URL("/about", url).toString();
    const response = await fetch(aboutUrl);
    if (!response.ok) return false;
    const data: any = await response.json();
    return "public_key" in data;
  } catch {
    return false;
  }
}

async function retry(fn: () => Promise<boolean>, serviceName: string): Promise<void> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    if (await fn()) {
      console.log(`✅ ${serviceName} is healthy.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Service ${serviceName} failed to start in time.`);
}
