import { OperationType, SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";

// update schema id and record id to delete with your own values
const SCHEMA_ID = "59c575dd-eb60-48f4-a391-b73d6d982df2";
const RECORD_ID = "82dde828-9fc7-4fe4-af24-354bd5c59d91";

async function main() {
  try {
    const collection = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
      SCHEMA_ID,
      OperationType.SUM,
    );
    await collection.init();

    const filterById = {
      _id: RECORD_ID,
    };

    const readOriginalRecord = await collection.readFromNodes(filterById);
    console.log("📚 Read original record:", readOriginalRecord);

    const deletedData = await collection.deleteDataFromNodes(filterById);
    console.log("📚 Deleted record from all nodes:", deletedData);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
