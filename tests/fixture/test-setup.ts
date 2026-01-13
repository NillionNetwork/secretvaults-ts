import { config } from "dotenv";

declare global {
  namespace NodeJS {
    // values from .env.test
    interface ProcessEnv {
      APP_MONGODB_URI: string;
      APP_NILDB_NODES: string;
      APP_NILAUTH_BASE_URL: string;
      APP_NILAUTH_PUBLIC_KEY: string;
      // Ethereum/Anvil configuration
      APP_ETHEREUM_RPC_URL: string;
      APP_CHAIN_ID: string;
      APP_NIL_TOKEN_ADDRESS: string;
      APP_BURN_CONTRACT_ADDRESS: string;
      APP_PAYER_PRIVATE_KEY: string;
    }
  }
}

config({ path: ".env.test" });
