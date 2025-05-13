import { OperationType, SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";

// Update query id with your own value
const QUERY_ID = "48183de8-3f20-4516-92b4-5a3b214548fe";

// Define payload variables. In this example we are targeting users who have answered question number `1`
const QUERY_VARIABLES = {
  question_number: 1,
};

async function main() {
  try {
    const collection = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
      null,
      OperationType.SUM,
    );
    await collection.init();

    const queryPayload = {
      id: QUERY_ID,
      variables: QUERY_VARIABLES,
    };

    const queryResult = await collection.executeQueryOnNodes(queryPayload);

    // Even though years_in_web3 entries are encrypted, we can get the sum without individually decrypting them
    console.log("📚 Query result:", queryResult);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
