import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "./orgConfig.js";

// update schema id with your own value
const SCHEMA_ID = "84b5c56c-e1f5-4772-aab6-6804a1a0ecd7";

async function main() {
  try {
    const collection = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
      SCHEMA_ID,
    );
    await collection.init();

    const deleted = await collection.deleteSchema(SCHEMA_ID);
    console.log("deleted", deleted);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
