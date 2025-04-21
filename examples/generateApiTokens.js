import { SecretVaultWrapper } from "secretvaults";
import { orgConfig } from "./orgConfig.js";

async function main() {
  try {
    console.log(orgConfig);
    const org = new SecretVaultWrapper(
      orgConfig.nodes,
      orgConfig.orgCredentials,
    );
    await org.init();

    // generate api tokens for all nodes in the org config
    const apiTokens = await org.generateTokensForAllNodes();
    console.log("🪙 API Tokens:", apiTokens);
  } catch (error) {
    console.error("❌ Failed to use SecretVaultWrapper:", error.message);
    process.exit(1);
  }
}

main();
