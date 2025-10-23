import { config } from "dotenv";

declare global {
  namespace NodeJS {
    // values from .env.test
    interface ProcessEnv {
      APP_MONGODB_URI: string;
      APP_NILDB_NODES: string;
      APP_NILAUTH_BASE_URL: string;
      APP_NILAUTH_PUBLIC_KEY: string;
      APP_NILCHAIN_JSON_RPC: string;
      APP_NILCHAIN_PRIVATE_KEY_0: string;
      APP_BUILDER_PRIVATE_KEY: string;
      APP_OTHER_BUILDER_PRIVATE_KEY: string;
    }
  }
}

config({ path: ".env.test" });
