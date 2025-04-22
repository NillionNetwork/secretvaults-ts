import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";

// update schema id and record id to delete with your own values
const SCHEMA_ID = "d8cbedef-e12a-468e-b5cf-caba3172afad";
const RECORD_ID = "d0e0aaa3-3431-467f-8af9-eee96bd9dfdc";

async function main() {
  try {
    const collection = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
      SCHEMA_ID,
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
