import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";

// Update query id with your own value
const QUERY_ID = "7464874d-d8a5-4c04-9c61-8a91c8cdd960";

// Define payload variables. In this example we are not using any.
const QUERY_VARIABLES = {};

async function main() {
  try {
    const collection = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
    );
    await collection.init();

    const queryPayload = {
      id: QUERY_ID,
      variables: QUERY_VARIABLES,
    };

    const queryResult = await collection.executeQueryOnNodes(queryPayload);
    console.log("📚 Query result:", queryResult);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
