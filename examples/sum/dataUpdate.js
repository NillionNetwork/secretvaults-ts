import { OperationType, SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";

// update schema id and record id to update with your own values
const SCHEMA_ID = "59c575dd-eb60-48f4-a391-b73d6d982df2";
const RECORD_ID = "74074714-9840-44da-91e0-22a7b9b6b9ef";

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
      OperationType.SUM,
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
