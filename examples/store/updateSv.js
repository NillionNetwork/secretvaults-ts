import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";

// update schema id and record id to update with your own values
const SCHEMA_ID = "d8cbedef-e12a-468e-b5cf-caba3172afad";
const RECORD_ID = "d0e0aaa3-3431-467f-8af9-eee96bd9dfdc";

const recordUpdate = {
  years_in_web3: { "%allot": 3 },
  responses: [
    { rating: 3, question_number: 1 },
    { rating: 3, question_number: 2 },
  ],
};

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

    const updatedData = await collection.updateDataToNodes(
      recordUpdate,
      filterById,
    );

    console.log("📚 Updated data:", updatedData);

    const readUpdatedRecord = await collection.readFromNodes(filterById);
    console.log("📚 Read updated record:", readUpdatedRecord);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
