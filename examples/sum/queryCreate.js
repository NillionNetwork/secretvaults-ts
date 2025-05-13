import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";
import query from "./query.json" with { type: "json" };

// Update schema id with your own value
const SCHEMA_ID = "59c575dd-eb60-48f4-a391-b73d6d982df2";

async function main() {
  try {
    const collection = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
    );
    await collection.init();

    const createdQuery = await collection.createQuery(
      query,
      "Returns sum of years in web3 and count of users that have answered question X",
      SCHEMA_ID,
    );
    console.log("📚 Created query:", createdQuery);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
