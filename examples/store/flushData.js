import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";

// update schema id  with your own values
const SCHEMA_ID = "d8cbedef-e12a-468e-b5cf-caba3172afad";

async function main() {
  try {
    const collection = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
      SCHEMA_ID,
    );
    await collection.init();

    const flushedData = await collection.flushData();
    console.log("📚 Flushed data:", flushedData);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
