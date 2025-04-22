import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "../orgConfig.js";

async function main() {
  try {
    const org = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
    );
    await org.init();

    const schemas = await org.getSchemas();
    console.log("📚 Schemas:", schemas);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
