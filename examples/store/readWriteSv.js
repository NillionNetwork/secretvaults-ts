import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";

// update schema id with your own value
const SCHEMA_ID = "d8cbedef-e12a-468e-b5cf-caba3172afad";

// '%allot' signals that the value will be encrypted to one %share per node before writing to the collection
const web3ExperienceSurveyData = [
  {
    years_in_web3: { "%allot": 4 },
    responses: [
      { rating: 5, question_number: 1 },
      { rating: 3, question_number: 2 },
    ],
  },
  {
    years_in_web3: { "%allot": 1 },
    responses: [
      { rating: 2, question_number: 1 },
      { rating: 4, question_number: 2 },
    ],
  },
];

async function main() {
  try {
    const collection = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
      SCHEMA_ID,
    );
    await collection.init();

    const dataWritten = await collection.writeToNodes(web3ExperienceSurveyData);
    console.log("dataWritten", dataWritten);

    const newIds = [
      ...new Set(dataWritten.flatMap((item) => item.data.created)),
    ];
    console.log("created ids:", newIds);

    const dataRead = await collection.readFromNodes({});
    console.log("📚 total records:", dataRead.length);
    console.log(
      "📚 Read new records:",
      dataRead.slice(0, web3ExperienceSurveyData.length),
    );
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
