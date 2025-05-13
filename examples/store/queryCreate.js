import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";
import query from "./query.json" with { type: "json" };

// Update schema id with your own value
const SCHEMA_ID = "d8cbedef-e12a-468e-b5cf-caba3172afad";

async function main() {
  try {
    const collection = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
    );
    await collection.init();

    const createdQuery = await collection.createQuery(
      query,
      "Returns the years in web3 of the users that gave the top 3 ratings",
      SCHEMA_ID,
    );
    console.log("📚 Created query:", createdQuery);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
